export const PLUGIN_VERSION = '0.1.0';
export const SUPPORTED_DSH = '0.2.2-rc.3';

export function diagnostics(runtimeVersion = null) {
  return {
    pluginVersion: PLUGIN_VERSION,
    runtimeVersion,
    supportedDsh: SUPPORTED_DSH,
    compatibility: runtimeVersion === null ? 'unknown' : runtimeVersion === SUPPORTED_DSH ? 'matched' : 'unverified',
    nodeVersion: process.versions.node,
    platform: process.platform,
    architecture: process.arch,
    transport: 'official-remote',
  };
}

export function validateTarget(value) {
  if (typeof value !== 'string' || value.length > 4096) throw new Error('请输入不超过 4096 字符的 HTTP 或 HTTPS 地址。');
  let url;
  try { url = new URL(value.trim()); } catch { throw new Error('地址格式不正确，请包含 http:// 或 https://。'); }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('仅支持 HTTP 和 HTTPS 地址。');
  if (url.username || url.password) throw new Error('请使用不含用户名和密码的地址。');
  url.hash = '';
  return url;
}

// One explicit GET, with no redirects, cookies, response body or persistent history.
export async function checkWebsite(value, timeoutMs = 5000, { signal, fetchImpl = fetch } = {}) {
  const url = validateTarget(value);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 250 || timeoutMs > 15000) throw new Error('超时必须为 250 至 15000 毫秒。');
  const deadline = AbortSignal.timeout(timeoutMs);
  const combined = signal ? AbortSignal.any([signal, deadline]) : deadline;
  const started = performance.now();
  const elapsed = () => Math.round(performance.now() - started);
  // Reports omit query strings, which may contain application credentials.
  const displayUrl = `${url.origin}${url.pathname}`;
  try {
    combined.throwIfAborted();
    const response = await fetchImpl(url.href, {
      method: 'GET', redirect: 'manual', signal: combined,
      credentials: 'omit', headers: { Accept: '*/*' },
    });
    const durationMs = elapsed();
    await response.body?.cancel();
    return { url: displayUrl, reachable: true, httpOk: response.ok, status: response.status,
      durationMs, redirect: response.status >= 300 && response.status < 400, error: null };
  } catch (error) {
    const reason = signal?.aborted ? '检查已取消。' : deadline.aborted ? `请求超过 ${timeoutMs} 毫秒。` : '连接失败，请检查地址、证书或网络。';
    return { url: displayUrl, reachable: false, httpOk: false, status: null,
      durationMs: elapsed(), redirect: false, error: reason };
  }
}
