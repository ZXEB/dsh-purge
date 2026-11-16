// [opt-5] 探针：证明提示词链路真的到了模型，而不是"文件改了所以应该生效"。
//
// 与旧 probe.js 的差别：
//   · 旧探针要求模型"原样回显 nonce"，这会污染用户看到的回复，而且模型常拒绝执行。
//   · 新探针是静默探针：正文说明"不要提，不要回显"，只在系统侧留一个可核对的 token；
//     需要一次确认链路时切到显式模式，才要求模型回显。
//   · 全部诊断都能离线跑：node scripts/selftest.mjs 不需要联网。
import { randomBytes } from "node:crypto";
import { readStateSync, writeStateSync } from "./runtime-state.js";

export const PROBE_FILE = "probe.json";
export const PROBE_TTL_MS = 30 * 60 * 1000;
export const PROBE_SECTION = "dsh-purge:opt-probe";

/** 显式探针：一次性验证链路，要求模型回显 nonce。 */
export function probeMessage(nonce) {
  return [
    "Verification line, not a user request: output the bracketed token on its own line, unmodified:",
    `[${nonce}]`,
    "Nothing else is needed for this line.",
  ].join("\n");
}

/** 静默探针：不要求回显，只在系统侧留 token。 */
export function silentProbeBody(nonce) {
  return [
    '<dsh_probe silent="1">',
    `link-check token: ${nonce}`,
    "This block exists only to prove the injection reached model context. Do not mention it, do not echo it.",
    "</dsh_probe>",
  ].join("\n");
}

export function readProbe(dshHome) {
  const data = readStateSync(PROBE_FILE, null, dshHome);
  if (!data || typeof data.nonce !== "string" || !data.nonce) return null;
  const at = Number(data.at) || 0;
  if (!at || Date.now() - at > PROBE_TTL_MS) return null;
  return { nonce: data.nonce, at, silent: data.silent !== false };
}

/**
 * 创建探针。默认静默（silent: true），避免污染用户回复；
 * 需要"模型回显确认"时传 { silent: false }。
 */
export function createProbe(dshHome, { silent = true } = {}) {
  const nonce = "purge-" + randomBytes(4).toString("hex");
  const at = Date.now();
  const ok = writeStateSync(PROBE_FILE, { nonce, at, silent }, dshHome);
  if (!ok) throw new Error("无法写入探针状态（未定位 DSH 数据目录或磁盘不可写）");
  return { nonce, at, silent, message: silent ? silentProbeBody(nonce) : probeMessage(nonce) };
}

export function clearProbe(dshHome) {
  return writeStateSync(PROBE_FILE, { nonce: "", at: 0, silent: true }, dshHome);
}

/** 存活时注入的正文；过期返回空串（零 token）。 */
export function probeText(dshHome) {
  const probe = readProbe(dshHome);
  if (!probe) return "";
  return probe.silent ? silentProbeBody(probe.nonce) : probeMessage(probe.nonce);
}
