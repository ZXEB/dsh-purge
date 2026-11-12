// [opt] 后端门面：把所有 opt-* 层装进宿主 ctx，配置从 $DSH_HOME 读，不碰 profile YAML。
//
// 设计约束：
//   · 单独安装即可用：不要求 index.js 改一行（index.js 只在末尾 import 本模块并调用 install）。
//   · 所有钩子自带幂等标记（ctx.__dshPurgeOpt*），重复 install 不会重复挂。
//   · 任何一层挂不上都只降级该层，其余照常工作，并在审计里留一条。
//   · 段注册走宿主真实 API；没有 API 就不装，绝不伪造一个"看起来装了"的返回值。
import { logAudit as __logAuditMaybe } from "./opt-audit-shim.js";
const logAudit = __logAuditMaybe;
import { installAssembleLayer } from "./opt-assemble.js";
import { installLockLayer } from "./opt-lock.js";
import { streamWithOptRetry } from "./opt-retry.js";
import { bumpLadder, ladderClause, noteCleanTurn, readLadder, resetLadder, LADDER_ORDER } from "./opt-ladder.js";
import { formLockFor } from "./opt-form.js";
import { selfHeal } from "./opt-budget.js";
import { refusalScore } from "./opt-signal.js";
import { readStateSync, writeStateSync } from "./runtime-state.js";
import { PROBE_SECTION, probeText } from "./opt-probe.js";

export const OPT_FILE = "opt.json";
export const OPT_SECTION = "dsh-purge:opt";

export const OPT_DEFAULTS = Object.freeze({
  enabled: true,          // 总开关
  retry: true,            // llm/stream 拦截重试
  maxRetries: 2,          // 0..4
  form: true,             // 形态锁
  assemble: true,         // 装配接管
  section: true,          // 把档位/形态锁作为 section 挂上
  sectionOrder: 10500,    // 排在 boost 之后
  decayAfter: 4,          // 连续 N 轮干净交付自动落一档
});

export function readOpt(dshHome) {
  const raw = readStateSync(OPT_FILE, {}, dshHome);
  const out = { ...OPT_DEFAULTS };
  for (const [k, v] of Object.entries(raw || {})) {
    if (!(k in OPT_DEFAULTS)) continue;
    if (typeof OPT_DEFAULTS[k] === "boolean") out[k] = v !== false;
    else if (typeof OPT_DEFAULTS[k] === "number") out[k] = Number.isFinite(Number(v)) ? Number(v) : OPT_DEFAULTS[k];
  }
  out.maxRetries = Math.max(0, Math.min(4, out.maxRetries));
  return out;
}

export function writeOpt(patch, dshHome) {
  writeStateSync(OPT_FILE, { ...readOpt(dshHome), ...patch }, dshHome);
  return readOpt(dshHome);
}

/** 每轮请求前算好的上下文块：档位 + 形态锁（敏感题面才生成）。 */
export function optContextText(taskText = "", dshHome) {
  const opt = readOpt(dshHome);
  if (!opt.enabled || !opt.section) return "";
  const parts = [];
  const clause = ladderClause(dshHome);
  if (clause) parts.push(clause);
  if (opt.form) {
    const f = formLockFor(taskText);
    if (f) parts.push(f);
  }
  return parts.join("\n");
}

/** 宿主段注册：不同版本 API 不同，能挂上哪个用哪个，挂不上就降级到 pre-step 锁。 */
function registerOptSection(ctx, order) {
  const text = () => optContextText("", undefined);
  const spec = { name: OPT_SECTION, order, interpolate: false, text };
  const candidates = [
    () => ctx.prompt?.addSection?.(spec),
    () => ctx.systemPrompt?.addSection?.(spec),
    () => ctx.prompt?.section?.(spec),
    () => ctx.service?.("prompt")?.addSection?.(spec),
  ];
  for (const fn of candidates) {
    try {
      if (fn() !== undefined) return true;
    } catch { /* 换下一个 API */ }
  }
  return false;
}

/**
 * 主入口。ctx 是 Cordis 上下文；config.opt 可覆盖 OPT_DEFAULTS（一般不用，改 opt.json 即可）。
 */
export function installOpt(ctx, config = {}) {
  const opt = { ...readOpt(), ...(typeof config.opt === "object" && config.opt ? config.opt : {}) };
  if (!opt.enabled || typeof ctx?.on !== "function") {
    logAudit("opt_install", { skipped: opt.enabled ? "no-ctx" : "disabled" });
    return { installed: [], skipped: [opt.enabled ? "no-ctx" : "disabled"], warnings: [] };
  }

  const report = { installed: [], skipped: [], warnings: [] };

  try {
    const heal = selfHeal();
    if (heal.warnings?.length) report.warnings.push(...heal.warnings);
  } catch { /* 自检失败不影响挂载 */ }

  try {
    const ok = opt.assemble && installAssembleLayer(ctx, opt);
    report[ok ? "installed" : "skipped"].push("assemble");
  } catch (e) {
    report.warnings.push(`assemble: ${e?.message || e}`);
  }

  try {
    const ok = installLockLayer(ctx, {
      readLadderClause: () => ladderClause(),
      readTier: () => readLadder(),
    });
    report[ok ? "installed" : "skipped"].push(ok ? "lock" : "lock(deferred)");
  } catch (e) {
    report.warnings.push(`lock: ${e?.message || e}`);
  }

  try {
    if (opt.retry) {
      if (ctx.__dshPurgeOptRetry) {
        report.skipped.push("retry(dup)");
      } else {
        ctx.__dshPurgeOptRetry = true;
        ctx.on(
          "llm/stream",
          (options, next) => {
            const cur = readOpt();
            if (!cur.enabled || !cur.retry) return next(options);
            return streamWithOptRetry((o) => next(o), options, {
              maxRetries: cur.maxRetries,
              onRetry: (info) => {
                const tier = info.hard ? bumpLadder(undefined, 1) : readLadder();
                logAudit("opt_retry_decision", {
                  tier,
                  hard: !!info.hard,
                  score: Number(Number(info.score || 0).toFixed(2)),
                });
                return "";
              },
            });
          },
          { global: true },
        );
        report.installed.push("retry");
      }
    } else {
      report.skipped.push("retry(off)");
    }
  } catch (e) {
    report.warnings.push(`retry: ${e?.message || e}`);
  }

  try {
    if (opt.section) {
      report[registerOptSection(ctx, opt.sectionOrder) ? "installed" : "skipped"].push("section");
    }
  } catch (e) {
    report.warnings.push(`section: ${e?.message || e}`);
  }

  // 干净交付 → 逐步落档，避免长会话一直挂在最高档白烧 token。
  try {
    ctx.on?.("llm/stream", (options, next) => {
      const inner = next(options);
      const after = async function* () {
        let sawRefusal = false;
        let text = "";
        for await (const chunk of inner) {
          if (chunk?.type === "text-delta") {
            text += chunk.text || "";
            if (text.length > 1200) text = text.slice(-1200);
          }
          yield chunk;
        }
        try {
          if (!sawRefusal && refusalScore(text).score < 0.6) noteCleanTurn(undefined, readOpt().decayAfter);
        } catch { /* 落档失败不影响流 */ }
      };
      return after();
    }, { global: true });
  } catch { /* ignore */ }

  logAudit("opt_install", {
    installed: report.installed.join(","),
    skipped: report.skipped.join(","),
    warnings: report.warnings.join(" | ").slice(0, 300),
  });
  return report;
}

export {
  bumpLadder,
  ladderClause,
  noteCleanTurn,
  readLadder,
  resetLadder,
  LADDER_ORDER,
  formLockFor,
  refusalScore,
  probeText,
  PROBE_SECTION,
};
