import React, { useEffect, useRef, useState } from 'react';
import { TYPERT_REMOTE } from './remote.js';

const field = { boxSizing: 'border-box', width: '100%', padding: '9px 12px', border: '1px solid currentColor', borderRadius: 8, background: 'transparent', color: 'inherit' };
const button = { padding: '8px 14px', border: '1px solid currentColor', borderRadius: 8, background: 'transparent', color: 'inherit', cursor: 'pointer' };
const box = { border: '1px solid #8886', borderRadius: 12, padding: 16, marginTop: 16 };

export function LocalTestPage({ call }) {
  const [diagnosis, setDiagnosis] = useState(null);
  const [target, setTarget] = useState('http://localhost:3000');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const request = useRef(null);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    let active = true;
    call('diagnose').then(value => { if (active) setDiagnosis(value); })
      .catch(e => { if (active) setError(e.message); });
    return () => { active = false; mounted.current = false; request.current?.abort(); };
  }, [call]);

  async function check(event) {
    event.preventDefault();
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true); setError(''); setResult(null);
    try {
      const value = await call('check', target, 5000, controller.signal);
      if (mounted.current) setResult(value);
    } catch (e) {
      if (mounted.current) setError(e.message);
    } finally {
      request.current = null;
      if (mounted.current) setBusy(false);
    }
  }

  return <section style={{ maxWidth: 720, padding: 8, color: 'inherit' }}>
    <h2 style={{ fontSize: 22, fontWeight: 600 }}>本地测试</h2>
    <p style={{ opacity: .75 }}>DSH Local Test 0.1.0 · 桌面环境诊断与网站连通性检查</p>
    <div style={box}>
      <h3 style={{ fontWeight: 600, marginBottom: 12 }}>运行环境</h3>
      {diagnosis ? <dl style={{ display: 'grid', gridTemplateColumns: '100px 1fr', gap: 8 }}>
        <dt>DSH 运行时</dt><dd>{diagnosis.runtimeVersion ?? '未能读取版本'}</dd>
        <dt>适配版本</dt><dd>{diagnosis.supportedDsh}</dd>
        <dt>版本检查</dt><dd>{({ matched: '匹配', unknown: '未知', unverified: '尚未验证' })[diagnosis.compatibility]}</dd>
        <dt>Node.js</dt><dd>{diagnosis.nodeVersion}</dd>
        <dt>系统</dt><dd>{diagnosis.platform} / {diagnosis.architecture}</dd>
        <dt>插件接口</dt><dd>官方 Remote</dd>
      </dl> : <p>正在读取环境…</p>}
    </div>
    <form style={box} onSubmit={check}>
      <h3 style={{ fontWeight: 600, marginBottom: 12 }}>网站连通性</h3>
      <label htmlFor="dsh-local-test-url">网站地址</label>
      <input id="dsh-local-test-url" style={{ ...field, marginTop: 8 }} type="url" required maxLength={4096}
        value={target} onChange={event => setTarget(event.target.value)} disabled={busy} />
      <p style={{ fontSize: 13, opacity: .75, margin: '10px 0' }}>点击后发送一次 GET 请求；5 秒超时。显示状态码和耗时，重定向交由你确认后检查。请仅检查你有权测试的网站。</p>
      <button type="submit" disabled={busy} style={button}>{busy ? '正在检查…' : '开始检查'}</button>
      {busy && <button type="button" style={{ ...button, marginLeft: 8 }} onClick={() => request.current?.abort()}>取消</button>}
    </form>
    {error && <p role="alert" style={{ marginTop: 16 }}>{error}</p>}
    {result && <div role="status" style={box}>
      <h3 style={{ fontWeight: 600 }}>{result.reachable ? `已收到 HTTP ${result.status} 响应` : '未能连接'}</h3>
      <p style={{ overflowWrap: 'anywhere', marginTop: 8 }}>{result.url}</p>
      <p>耗时：{result.durationMs} ms</p>
      {result.redirect && <p>服务器返回重定向；本次未访问跳转地址。</p>}
      {result.reachable && !result.httpOk && !result.redirect && <p>网络可达，服务器返回了错误状态。</p>}
      {result.error && <p>{result.error}</p>}
    </div>}
  </section>;
}

export const name = 'dsh-local-test';
export const inject = ['slots', 'remote'];
export function apply(ctx) {
  ctx.effect(() => ctx.remote.$mount(TYPERT_REMOTE));
  ctx.inject(['remote.localTest'], scope => {
    const remote = scope.get('remote.localTest');
    const call = async (method, ...args) => {
      const result = await remote[method](...args);
      if (!result.ok) throw new Error(result.error?.message ?? 'Remote 调用失败，请检查插件状态。');
      return result.value;
    };
    scope.slots.inject('settings.section', () => scope.slots.register({
      name: 'settings.section', id: 'dsh-local-test', label: '本地测试', order: 95,
      inject: () => ({ call }),
    }, LocalTestPage));
  });
}
