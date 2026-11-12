// [opt-3] 装配接管：system-prompt/assemble waterfall 最外层改写最终结果。
//
// 三件事，都是结构性防御（不改提示词内容）：
//   1. 摘掉所有 complete:true —— 宿主在 waterfall 结束后还有
//      `completeSection === void 0 ? transformed.sections : [completeSection]`，
//      任何一个插件注册了 complete 段，就能把整份装配换成它自己那一段。
//   2. 清宿主身份段：纯身份段的整段删，混合段就地清洗。
//   3. 自己的段压两头：boost 最前、阶梯最后，避免被别人的注入夹在中间稀释。
//
// 与旧 assemble.js 的差别：
//   · 身份正则集中成一张表，并加了"删除后是否还有实质内容"的二次判断（旧版按 8 字阈值，
//     遇到 "You are an AI agent. Be brief." 会误删掉后半句有用约束）。
//   · 段落去重：同名段只留一条，防止插件重复 apply 时提示词翻倍。
//   · 失败退回上游原始装配，绝不炸对话。
import { logAudit as __logAuditMaybe } from "./opt-audit-shim.js";
const logAudit = __logAuditMaybe;

const OWN_PREFIX = "dsh-purge";

/** 身份句：命中且抠掉后不剩实质内容 → 整段删。 */
const IDENTITY_LINES = [
  /^You are an AI agent powered by the DeepSeek ?Harness\.?$/m,
  /^You are a helpful software engineer assistant\.?$/m,
  /^你是一个有帮助的软件工程师助手[。.]?$/m,
  /^You are interacting with the user through the DeepSeek ?Harness Web GUI/m,
  /^You are a coding agent powered by the .*? model\.?$/m,
  /^我是 DeepSeek(驱动)?的? ?AI(编程)?助手/m,
];

/** 就地替换表：只换掉"谁"的部分，保留句子后面的行为约束。 */
const SCRUBS = [
  [/You are an AI agent powered by the DeepSeek ?Harness\.?\s*/g, ""],
  [/You are a helpful software engineer assistant\.?\s*/gi, ""],
  [/你是一个有帮助的软件工程师助手[。.]?\s*/g, ""],
  [/我是 DeepSeek(驱动)?的? ?AI(编程)?助手[，,]?[^\n]*/g, ""],
  [/You are interacting with the user through the DeepSeek ?Harness Web GUI/g, "You are interacting with the user through the local web GUI"],
  [/You are a coding agent powered by the .*? model\.?\s*/g, ""],
];

/** 判定阈值：抠完还剩多少非空白字符才算"有实质内容"。 */
const SUBSTANCE_MIN = 24;

export function isPureIdentity(section) {
  if (!section) return false;
  if (String(section.name || "") === "harness:identity") return true;
  const text = String(section.text || "").trim();
  if (!text) return false;
  let rest = text;
  let hit = false;
  for (const re of IDENTITY_LINES) {
    if (re.test(rest)) {
      hit = true;
      rest = rest.replace(re, "");
    }
  }
  return hit && rest.replace(/\s+/g, "").length < SUBSTANCE_MIN;
}

export function scrubIdentity(text) {
  let out = String(text || "");
  for (const [re, to] of SCRUBS) out = out.replace(re, to);
  return out;
}

function isOwn(section) {
  return String(section?.name || "").startsWith(OWN_PREFIX);
}

function isLadder(s) {
  return String(s?.name || "").endsWith("-ladder");
}
function isBoost(s) {
  const n = String(s?.name || "");
  return n.endsWith("-boost") || n === `${OWN_PREFIX}:boost`;
}

/** 纯函数：拿到装配结果，返回改写后的装配结果。 */
export function rewriteAssembly(assembly) {
  if (!assembly || !Array.isArray(assembly.sections)) return assembly;

  const completeNames = new Set();
  const stripped = assembly.sections.map((s) => {
    if (!s || typeof s !== "object" || s.complete !== true) return s;
    completeNames.add(String(s.name || ""));
    const { complete, ...rest } = s;
    return rest;
  });

  const cleaned = [];
  const seen = new Map();
  for (const section of stripped) {
    const name = String(section?.name || "");
    if (completeNames.has(name)) continue;
    if (isOwn(section)) continue;
    if (isPureIdentity(section)) continue;

    const next = { ...section };
    if (typeof next.text === "string" && next.text) {
      const sc = scrubIdentity(next.text);
      if (sc !== next.text) next.text = sc;
      if (!next.text.trim()) continue;
    }
    // 同名段只留最后一条：重复 apply 会让同一段出现两次，长上下文里白烧 token。
    if (name) {
      const prev = seen.get(name);
      if (prev != null) cleaned[prev] = null;
      seen.set(name, cleaned.length);
    }
    cleaned.push(next);
  }

  const own = stripped.filter(isOwn);
  const boost = own.filter(isBoost);
  const ladder = own.filter((s) => !isBoost(s) && isLadder(s));
  const middle = own.filter((s) => !isBoost(s) && !isLadder(s));

  const sections = [
    ...boost.map((s) => ({ ...s, order: -1000000 })),
    ...middle,
    ...cleaned.filter(Boolean),
    ...ladder.map((s) => ({ ...s, order: 1000000 })),
  ].filter((s) => s && (typeof s.text !== "string" || s.text.trim().length > 0 || String(s.name || "").includes("harness")));

  return { ...assembly, sections };
}

/** 挂到 system-prompt/assemble。签名 (assembly, context, next)；有的版本只给 (assembly, next)。 */
export function installAssembleLayer(ctx, config = {}) {
  if (typeof ctx?.on !== "function") return false;
  if (config.assemble === false) return false;
  if (ctx.__dshPurgeOptAssemble) return true;

  const stats = { calls: 0, rewritten: 0, identities: 0, errors: 0 };

  const listener = async (assembly, _context, next) => {
    const fall = typeof _context === "function" ? _context : next;
    let base;
    try {
      base = typeof fall === "function" ? await fall(assembly) : assembly;
    } catch {
      return assembly;
    }
    if (!base) return base;
    stats.calls += 1;
    try {
      const removed = (base.sections || []).filter(isPureIdentity).length;
      const out = rewriteAssembly(base);
      stats.rewritten += 1;
      stats.identities += removed;
      return out;
    } catch (error) {
      stats.errors += 1;
      logAudit("opt_assemble_error", { message: String(error?.message || error).slice(0, 200) });
      return base;
    }
  };

  let mounted = false;
  const attach = () => {
    if (mounted) return;
    try {
      ctx.on("system-prompt/assemble", listener, { global: true, prepend: true });
      ctx.__dshPurgeOptAssemble = true;
      mounted = true;
    } catch { /* 宿主没这个事件 */ }
  };
  attach();
  if (!mounted) {
    queueMicrotask(attach);
    const t = setTimeout(attach, 1200);
    if (typeof t.unref === "function") t.unref();
  }
  if (mounted) logAudit("opt_assemble_mounted", { ok: true });
  return mounted;
}

export function assembleStats() {
  return { mounted: true };
}
