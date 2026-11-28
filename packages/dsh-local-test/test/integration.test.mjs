import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import { Context, Service } from '@deepseek-ai/cordis';
import Registry from '@deepseek-ai/dsh-typert-registry';
import Gateway from '@deepseek-ai/dsh-api-gateway';
import * as ClientGateway from '@deepseek-ai/dsh-api-gateway/client';
import LocalTest from '../lib/index.js';
import { TYPERT } from '../src/typert.js';
import { TYPERT_REMOTE } from '../src/remote.js';

async function setup(t) {
  const host = new Context();
  t.after(() => host.fiber.dispose());
  host.provide('remoteAccess', { decide: () => ({ kind: 'deny', reason: 'test-policy' }) });
  await host.plugin(Registry);
  const contribution = host.typert.register(TYPERT);
  t.after(contribution);
  await host.plugin(LocalTest);
  await host.plugin(Gateway, {});
  const peer = { id: 'test-owner', ctx: host, principal: { kind: 'owner' },
    signal: new AbortController().signal, interactions: 'none', dispose: async () => {} };
  const invoke = (method, args = {}, signal, principal) => host.typertGateway.invoke({
    namespace: 'localTest', method, args, signal, peer: principal ? { ...peer, principal } : peer,
  });
  return { host, invoke };
}

test('strict Host metadata invokes real service and rejects malformed input', async t => {
  const { host, invoke } = await setup(t);
  const diagnosis = await invoke('diagnose');
  assert.equal(diagnosis.pluginVersion, '0.1.0');
  TYPERT_REMOTE.methods['localTest/diagnose'].result.create().parse(diagnosis);
  await assert.rejects(invoke('check', { target: 'http://localhost', timeoutMs: 1 }), { code: 'gateway/input-invalid' });
  await assert.rejects(invoke('check', { target: 'http://localhost', timeoutMs: 5000, extra: true }));
  await assert.rejects(invoke('diagnose', {}, undefined, { kind: 'test-guest' }), { code: 'remote-access/denied' });
  assert.equal(host.typert.local.list().length, 2);
});

test('Remote enforces one active request, cancellation and unload cleanup', async t => {
  const { host, invoke } = await setup(t);
  const server = createServer(() => {});
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const args = { target: `http://127.0.0.1:${server.address().port}`, timeoutMs: 5000 };
  const controller = new AbortController();
  const pending = invoke('check', args, controller.signal);
  await delay(30);
  await assert.rejects(invoke('check', args), /已有检查/);
  controller.abort();
  assert.equal((await pending).reachable, false);
  const unloading = invoke('check', args);
  await delay(30);
  host.registry.delete(LocalTest);
  assert.match((await unloading).error, /取消/);
});

test('browser bundle mounts official Client Remote, registers settings, and unloads', async t => {
  const { invoke } = await setup(t);
  const client = new Context();
  t.after(() => client.fiber.dispose());
  await client.plugin(Registry);
  client.provide('connection', {
    interactions: 'none', isLoopback: true,
    rpc: { open() { throw new Error('No streams expected'); }, async call(path, endpoint, payload, signal) {
      assert.equal(path, '/api');
      try { return { ok: true, value: await invoke(endpoint.split('/')[1], payload.args, signal) }; }
      catch (error) { return { ok: false, error }; }
    } },
  });
  await client.plugin(ClientGateway);
  const registrations = [];
  class TestSlots extends Service {
    constructor(ctx) { super(ctx, 'slots'); }
    inject(slot, register) { return this.ctx.effect(register); }
    register(options, component) {
      const row = { options, component }; registrations.push(row);
      return () => { registrations.splice(registrations.indexOf(row), 1); };
    }
  }
  await client.plugin(TestSlots);
  const require = createRequire(import.meta.url);
  let plugin;
  vm.runInNewContext(await readFile(new URL('../lib/client.js', import.meta.url), 'utf8'), {
    window: { __ModuleLoader__: { load({ id, factory }) { assert.equal(id, 'dsh-local-test'); plugin = factory(require); } } },
    AbortController, AbortSignal, console,
  });
  await client.plugin(plugin);
  await delay(10);
  assert.equal(registrations.length, 1);
  assert.equal(registrations[0].options.name, 'settings.section');
  const { call } = registrations[0].options.inject();
  assert.equal((await call('diagnose')).pluginVersion, '0.1.0');
  const React = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  assert.match(renderToStaticMarkup(React.createElement(registrations[0].component, { call })), /本地测试/);
  client.registry.delete(plugin);
  await delay(10);
  assert.equal(registrations.length, 0);
  assert.equal(client.get('remote.localTest'), undefined);
});
