// 审计出口：装上原插件时用它的 audit.jsonl，独立运行时退回 console。
//
// 为什么不在各模块里直接 import "./audit.js"：本包允许独立安装（比如放到别的目录做
// 单元验证），硬 import 会让整个模块图加载失败。这里用同步存在性检查 + 动态 import 的
// 静态可解析形态，保证 ESM 解析不到时不会炸。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SIBLING = path.join(HERE, "audit.js");

let impl = null;
let warm = false;

function consoleAudit(event, data = {}) {
  try {
    const keys = data && typeof data === "object" ? Object.keys(data) : [];
    if (!keys.length) console.warn(`[dsh-purge-opt] ${event}`);
    else console.warn(`[dsh-purge-opt] ${event}`, data);
  } catch { /* 控制台不可用 */ }
}

/**
 * 同步出口：模块加载时先决定用哪个。
 * 注意这里用的是 createRequire 而不是 await import —— 审计在每次请求路径上被调用，
 * 不能是异步的；同包内的 audit.js 是 ESM，所以只在存在时用 require 之外的方式不可行，
 * 因此改为：存在 → 动态 import 一次并缓存；不存在 → console。
 * 第一次调用时如果缓存还没建好，先走 console，下次起用真审计。
 */
export function logAudit(event, data = {}, home) {
  if (impl) return impl(event, data, home);
  if (!warm) {
    warm = true;
    try {
      if (fs.existsSync(SIBLING)) {
        import("./audit.js")
          .then((m) => {
            if (typeof m.logAudit === "function") impl = m.logAudit;
          })
          .catch(() => { /* 保持 console */ });
      }
    } catch { /* 保持 console */ }
  }
  return consoleAudit(event, data);
}

export function auditBackend() {
  return impl ? "plugin" : "console";
}
