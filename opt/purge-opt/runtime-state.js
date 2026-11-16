// [opt] 统一状态文件层：所有 opt-* 模块的落盘都走这里。
//
// 三条硬约束（都是踩过的坑）：
//   1. 原子写：write tmp → fsync → rename。半截 JSON 会让下一个读到的模块直接崩，
//      而状态文件正好都在宿主启动路径上，崩一次就是整个插件不加载。
//   2. 永不抛：状态读写的失败不能让对话链路失败。坏文件按默认值 + quarantine 丢到一边。
//   3. 只写 $DSH_HOME/dsh-purge/ 下：不碰宿主源码、不碰用户预设。
import fs from "node:fs";
import path from "node:path";
import { homedir } from "node:os";

export const STATE_DIR = "dsh-purge";

/**
 * 解析 DSH_HOME。与 core.findDshHome 的差异：这里不做全盘探测，
 * 只认显式参数 → 环境变量 → ~/.dsh 三级，保证插件启动路径上零 IO 抖动。
 */
export function resolveHome(dshHome) {
  const explicit = String(dshHome || "").trim();
  if (explicit) return explicit;
  const env = String(process.env.DSH_HOME || "").trim();
  if (env) return env;
  try {
    return path.join(homedir(), ".dsh");
  } catch {
    return "";
  }
}

/** 状态目录；解析不到时返回空串，调用方一律按"只读内存态"处理。 */
export function stateDir(dshHome) {
  const home = resolveHome(dshHome);
  if (!home) return "";
  return path.join(home, STATE_DIR);
}

export function statePath(name, dshHome) {
  const dir = stateDir(dshHome);
  return dir ? path.join(dir, name) : "";
}

/**
 * 原子写。返回 true/false，不抛。
 * fsync 是必要的：状态文件多半在断电/进程被 kill 时写，rename 保证"旧或新"，
 * 但没有 fsync 时 rename 可能先于数据落盘，重启后拿到空文件。
 */
export function writeStateSync(name, value, dshHome) {
  const file = statePath(name, dshHome);
  if (!file) return false;
  const dir = path.dirname(file);
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  try {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    const text = JSON.stringify(value, null, 2) + "\n";
    const fd = fs.openSync(tmp, "w", 0o600);
    try {
      fs.writeFileSync(fd, text, "utf8");
      try { fs.fsyncSync(fd); } catch { /* 某些文件系统不支持，rename 仍然原子 */ }
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(tmp, file);
    return true;
  } catch {
    try { fs.unlinkSync(tmp); } catch { /* 临时文件本来就不该留 */ }
    return false;
  }
}

/**
 * 读状态。坏文件改名 quarantine 后返回 fallback——不要静默 delete：
 * 排障时要能看到"哪次写入把它写坏了"。
 */
export function readStateSync(name, fallback = null, dshHome) {
  const file = statePath(name, dshHome);
  if (!file) return fallback;
  let raw;
  try {
    raw = fs.readFileSync(file, "utf8");
  } catch {
    return fallback;
  }
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return fallback;
    return parsed;
  } catch {
    try { fs.renameSync(file, `${file}.corrupt-${Date.now()}`); } catch { /* 改不动就留在原地 */ }
    return fallback;
  }
}

/** 文件是否存在（仅用于兼容旧版遗留文件，不做判断依据）。 */
export function stateExists(name, dshHome) {
  const file = statePath(name, dshHome);
  if (!file) return false;
  try {
    return fs.existsSync(file);
  } catch {
    return false;
  }
}
