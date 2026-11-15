import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import { checkWebsite, diagnostics } from './core.js';

function runtimeVersion(ctx): string | null {
  // Resolve from the host composition, rather than reporting our pinned SDK as the application version.
  try {
    if (!ctx.baseUrl) return null;
    const require = createRequire(ctx.baseUrl);
    const manifest = JSON.parse(readFileSync(require.resolve('@deepseek-ai/dsh-app-boot/package.json'), 'utf8'));
    return typeof manifest.version === 'string' ? manifest.version : null;
  } catch { return null; }
}

export default class LocalTest extends TypertRemoteService {
  private lifetime = new AbortController();
  private activity = { pending: false };
  private version: string | null;

  constructor(ctx) {
    super(ctx, 'localTest');
    this.version = runtimeVersion(ctx);
    ctx.effect(() => () => this.lifetime.abort());
  }

  @Remote
  diagnose() { return diagnostics(this.version); }

  @Remote
  async check(target: string, timeoutMs: number, signal: AbortSignal) {
    if (this.activity.pending) throw new Error('已有检查正在进行，请等待完成。');
    this.activity.pending = true;
    try {
      return await checkWebsite(target, timeoutMs, {
        signal: signal ? AbortSignal.any([signal, this.lifetime.signal]) : this.lifetime.signal,
      });
    } finally { this.activity.pending = false; }
  }
}
