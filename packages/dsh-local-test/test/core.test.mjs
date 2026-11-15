import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'node:http';
import { checkWebsite, diagnostics, validateTarget } from '../src/core.js';

let server, base;
const requests = [];
before(async () => {
  server = createServer((req, res) => {
    requests.push({ url: req.url, method: req.method, cookie: req.headers.cookie });
    if (req.url === '/slow') return;
    if (req.url === '/redirect') { res.writeHead(302, { Location: '/ok' }); res.end(); return; }
    if (req.url === '/error') { res.writeHead(503); res.end(); return; }
    res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end('ok');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });

test('one GET, no cookie, query hidden in result', async () => {
  const before = requests.length;
  const result = await checkWebsite(`${base}/ok?token=example`);
  assert.equal(result.status, 200); assert.equal(result.httpOk, true);
  assert.equal(result.url, `${base}/ok`);
  assert.equal(requests.length, before + 1);
  assert.deepEqual(requests.at(-1), { url: '/ok?token=example', method: 'GET', cookie: undefined });
});
test('HTTP errors remain reachable', async () => {
  const result = await checkWebsite(`${base}/error`);
  assert.equal(result.status, 503); assert.equal(result.reachable, true); assert.equal(result.httpOk, false);
});
test('redirect makes no follow-up request', async () => {
  const before = requests.length;
  const result = await checkWebsite(`${base}/redirect`);
  assert.equal(result.status, 302); assert.equal(result.redirect, true);
  assert.equal(requests.length, before + 1);
});
test('timeout is bounded', async () => {
  const result = await checkWebsite(`${base}/slow`, 250);
  assert.equal(result.reachable, false); assert.match(result.error, /250/);
  assert.ok(result.durationMs >= 200 && result.durationMs < 2000);
});
test('caller cancellation interrupts request', async () => {
  const controller = new AbortController();
  const pending = checkWebsite(`${base}/slow`, 5000, { signal: controller.signal });
  controller.abort();
  const result = await pending;
  assert.equal(result.reachable, false); assert.match(result.error, /取消/);
});
test('network failure hides raw error details', async () => {
  const result = await checkWebsite(base, 5000, { fetchImpl: async () => { throw new Error('secret'); } });
  assert.equal(result.status, null); assert.equal(result.reachable, false);
  assert.ok(!JSON.stringify(result).includes('secret'));
});
test('reject invalid schemes, credentials, timeouts before network', async () => {
  for (const url of ['file:///etc/passwd', 'ftp://example.com', 'http://user:pass@example.com', 'example.com', 'a'.repeat(4097)]) {
    assert.throws(() => validateTarget(url));
  }
  for (const value of [0, 249, 15001, 3.5, '5000']) await assert.rejects(checkWebsite(base, value));
  assert.equal(validateTarget(`${base}/ok#part`).hash, '');
});
test('response stream is cancelled without reading its body', async () => {
  let cancelled = false;
  const response = new Response(new ReadableStream({ cancel() { cancelled = true; } }));
  await checkWebsite(base, 5000, { fetchImpl: async () => response });
  assert.equal(cancelled, true);
});
test('version diagnosis distinguishes unknown and unverified', () => {
  assert.equal(diagnostics().compatibility, 'unknown');
  assert.equal(diagnostics('0.2.2-rc.3').compatibility, 'matched');
  assert.equal(diagnostics('0.2.3').compatibility, 'unverified');
});
