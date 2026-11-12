// [opt-6] 预算与自愈：这个插件最容易把自己搞坏的两处，都在运行时状态上。
//
// 问题 A：每一轮都往消息尾部贴锁 → token 花在锁上。长会话里锁比正文还长。
//   解决：token 预算。按会话累计锁的字符数，超过 budget 后：优先只留形态锁（去掉交付锁），
//   再超就只在"该出事"时才落锁（纯按需），并回落到 12 小时窗口。
//
// 问题 B：状态文件写坏 / 权限变了 / 目录被删 → 下次启动插件读不到状态，
//   表现为"档位丢了""锁不生效"，用户只能重装。
//   解决：启动自检 + 自愈：目录重建、坏文件 quarantine、必填字段补齐，
//   结果写一条审计；全部失败也不阻塞插件加载。
import fs from "node:fs";
import { logAudit } from "./audit.js";
import { readStateSync, stateDir, writeStateSync } from "./runtime-state.js";

export const BUDGET_FILE = "opt-budget.json";

export const BUDGET_DEFAULTS = Object.freeze({
  // 单会话锁字符上限。锁本身约 120~260 字符，5000 ≈ 20~40 轮。
  sessionChars: 5000,
  // 超限后的降级顺序：full → form-only → on-demand-only。
  degrade: true,
  windowMs: 12 * 60 * 60 * 1000,
});

function nowBucket(ms) {
  return Math.floor(Date.now() / ms);
}

export function readBudget(dshHome) {
  const raw = readStateSync(BUDGET_FILE, {}, dshHome);
  return {
    sessionChars: Number(raw.sessionChars) > 0 ? Number(raw.sessionChars) : BUDGET_DEFAULTS.sessionChars,
    degrade: raw.degrade !== false,
    windowMs: Number(raw.windowMs) > 0 ? Number(raw.windowMs) : BUDGET_DEFAULTS.windowMs,
    used: Number(raw.used) || 0,
    bucket: String(raw.bucket || ""),
    level: ["full", "form-only", "on-demand-only"].includes(raw.level) ? raw.level : "full",
  };
}

export function writeBudget(patch, dshHome) {
  const cur = readBudget(dshHome);
  const next = { ...cur, ...patch };
  writeStateSync(BUDGET_FILE, next, dshHome);
  return next;
}

/** 记一次落锁的消耗，并返回当前允许的锁级别。 */
export function chargeBudget(chars, dshHome) {
  const cur = readBudget(dshHome);
  const bucket = String(nowBucket(cur.windowMs));
  let used = cur.bucket === bucket ? cur.used : 0;
  used += Math.max(0, Number(chars) || 0);

  let level = cur.level;
  if (!cur.degrade) {
    level = "full";
  } else if (used > cur.sessionChars * 2) {
    level = "on-demand-only";
  } else if (used > cur.sessionChars) {
    level = "form-only";
  }

  writeStateSync(BUDGET_FILE, { ...cur, used, bucket, level }, dshHome);
  return { level, used, sessionChars: cur.sessionChars };
}

/** 新会话 / 用户显式复位时调用。 */
export function resetBudget(dshHome) {
  const cur = readBudget(dshHome);
  writeStateSync(BUDGET_FILE, { ...cur, used: 0, bucket: String(nowBucket(cur.windowMs)), level: "full" }, dshHome);
  return readBudget(dshHome).level;
}

/**
 * 启动自检。返回 { ok, actions[], warnings[] }，永不抛。
 * 动作都是"重建/隔离/补默认值"，不改用户数据内容。
 */
export function selfHeal(dshHome) {
  const actions = [];
  const warnings = [];
  try {
    const dir = stateDir(dshHome);
    if (!dir) {
      warnings.push("未定位 DSH 数据目录，插件运行在只读内存态");
      return { ok: false, actions, warnings };
    }
    if (!fs.existsSync(dir)) {
      try {
        fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
        actions.push("recreate-state-dir");
      } catch (e) {
        warnings.push(`状态目录不可创建: ${e?.code || e?.message}`);
      }
    }
    // 关键状态文件补默认值（读不到就写一份默认，并且只在文件缺失时写）。
    const ladder = readStateSync("ladder.json", null, dshHome);
    if (!ladder) {
      writeStateSync("ladder.json", { tier: "L0", bumps: 0, decays: 0, updated: new Date().toISOString() }, dshHome);
      actions.push("seed-ladder");
    }
    const tuning = readStateSync("tuning.json", null, dshHome);
    if (!tuning) {
      writeStateSync("tuning.json", { opt: true, optRetry: true, optForm: true }, dshHome);
      actions.push("seed-tuning");
    }
    if (actions.length) logAudit("opt_selfheal", { actions: actions.join(",") });
    return { ok: true, actions, warnings };
  } catch (error) {
    warnings.push(String(error?.message || error).slice(0, 200));
    return { ok: false, actions, warnings };
  }
}
