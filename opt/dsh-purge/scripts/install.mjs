// 安装器：把 dsh-purge-opt 挂到已安装的 dsh-purge / dsh-purge-community 插件上。
//
// 为什么不改宿主源码：dsh-purge 自己的 apply 会按补丁表重写宿主文件并保留备份，
// 对宿主的任何手改都会被下一次 apply 覆盖；插件目录里的 lib/*.js 才是插件自己的代码。
// 升级插件时 npm 只按 files 白名单铺文件，我们多出来的文件会消失——所以安装器是幂等的：
// 升级后重跑一次即可。
//
// 为什么不改 index.js：ESM 的导出绑定是只读的，追加代码去赋值 `apply = ...` 必然
// TypeError（严格模式）。正确做法是改写 cordis.patch.yml，让宿主先插一个
// 我们的 "companion" 适配器，它 import 原插件模块后用 installOpt 包一层 config，
// 再把同一个 ctx 交给原 apply。
//
// 用法：
//   node install.mjs --target <dir> [--dry-run]
//   node install.mjs --target <dir> --uninstall
//   node install.mjs --discover          # 自动找 profile 下的 dsh-purge*
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PKG_LIB = path.join(HERE, "..", "lib");

const COPY = [
  "runtime-state.js",
  "opt-audit-shim.js",
  "opt-signal.js",
  "opt-form.js",
  "opt-retry.js",
  "opt-lock.js",
  "opt-assemble.js",
  "opt-ladder.js",
  "opt-probe.js",
  "opt-budget.js",
  "opt.js",
  "opt-companion.js",
];

const YML_BEGIN = "  # >>> dsh-purge-opt companion begin (managed) >>>";
const YML_END = "  # <<< dsh-purge-opt companion end <<<";

const COMPANION_ID = "dsh-purge-opt";

function parseArgs(argv) {
  const out = { target: "", uninstall: false, dryRun: false, discover: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--target") out.target = argv[++i] || "";
    else if (a === "--uninstall") out.uninstall = true;
    else if (a === "--dry-run") out.dryRun = true;
    else if (a === "--discover") out.discover = true;
    else if (a === "--help" || a === "-h") out.help = true;
  }
  return out;
}

function isInside(child, root) {
  const rel = path.relative(path.resolve(root), path.resolve(child));
  return !!rel && !rel.startsWith("..") && !path.isAbsolute(rel);
}

/** 找所有 profile 下的 dsh-purge* 目录（只找 node_modules 一层，不再递归）。 */
export function discoverTargets(home = process.env.DSH_HOME || path.join(os.homedir(), ".dsh")) {
  const out = [];
  const profiles = path.join(home, "profiles");
  let names = [];
  try {
    names = fs.readdirSync(profiles, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
  } catch {
    return out;
  }
  for (const p of names) {
    const nm = path.join(profiles, p, "node_modules");
    let entries = [];
    try {
      entries = fs.readdirSync(nm, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
    } catch {
      continue;
    }
    for (const e of entries) {
      if (!/^dsh-purge/.test(e)) continue;
      const dir = path.join(nm, e);
      const pkg = path.join(dir, "package.json");
      if (!fs.existsSync(path.join(dir, "lib", "index.js"))) continue;
      let name = e;
      let version = "";
      try {
        const meta = JSON.parse(fs.readFileSync(pkg, "utf8"));
        name = meta.name || e;
        version = meta.version || "";
      } catch { /* 坏 package.json 也能装 */ }
      out.push({ dir, name, version, profile: p });
    }
  }
  return out;
}

function ensureTarget(target) {
  const lib = path.join(target, "lib");
  if (!fs.existsSync(lib) || !fs.statSync(lib).isDirectory()) {
    throw new Error(`目标不像 dsh-purge 安装目录（缺少 lib/）：${target}`);
  }
  const pkg = path.join(target, "package.json");
  if (fs.existsSync(pkg)) {
    const meta = JSON.parse(fs.readFileSync(pkg, "utf8"));
    if (!/^dsh-purge/.test(String(meta.name || ""))) {
      throw new Error(`目标 package.json 的 name 不是 dsh-purge*：${meta.name}`);
    }
  }
  return lib;
}

function stripManagedYml(text) {
  const b = text.indexOf(YML_BEGIN);
  const e = text.indexOf(YML_END);
  if (b < 0 || e < 0 || e < b) return { text, removed: false };
  return { text: text.slice(0, b) + text.slice(e + YML_END.length).replace(/^\n+/, ""), removed: true };
}

function companionBlock(pkgName) {
  // base：原插件入口模块说明符。priority：挂在原插件之后（prepend 会让 opt 的锁先于
  // 原插件的 pre-step 运行，档位文本可能滞后一轮）。
  return [
    YML_BEGIN,
    `  - insert:`,
    `      - id: ${COMPANION_ID}`,
    `        name: '${pkgName}/opt-companion'`,
    `        inject: [systemPrompt, tools]`,
    `        config:`,
    `          base: '${pkgName}'`,
    `          priority: after`,
    YML_END,
  ].join("\n");
}

function install({ target, dryRun }) {
  const lib = ensureTarget(target);
  const pkgPath = path.join(target, "package.json");
  const meta = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  const pkgName = String(meta.name);

  // 1. 铺文件
  for (const name of COPY) {
    const src = path.join(PKG_LIB, name);
    if (!fs.existsSync(src)) throw new Error(`补丁文件缺失：${src}`);
    const dst = path.join(lib, name);
    if (!isInside(dst, target)) throw new Error(`拒绝写到目标目录以外：${dst}`);
    if (!dryRun) fs.copyFileSync(src, dst);
    console.log(`${dryRun ? "[dry] " : ""}copy lib/${name}`);
  }

  // 2. exports 增补（宿主按子路径 import 我们的适配器，必须有导出映射）
  const wantExports = {
    "./opt": "./lib/opt.js",
    "./opt-companion": "./lib/opt-companion.js",
    "./opt-assemble": "./lib/opt-assemble.js",
  };
  const exports = { ...(meta.exports || {}) };
  let exportsChanged = false;
  for (const [k, v] of Object.entries(wantExports)) {
    if (exports[k] !== v) {
      exports[k] = v;
      exportsChanged = true;
    }
  }
  if (exportsChanged) {
    const next = { ...meta, exports };
    if (!dryRun) fs.writeFileSync(pkgPath, JSON.stringify(next, null, 2) + "\n", "utf8");
    console.log(`${dryRun ? "[dry] " : ""}update package.json exports`);
  }

  // 3. cordis.patch.yml 里插 companion（幂等：先剥旧段再插）
  const ymlPath = path.join(target, "cordis.patch.yml");
  if (!fs.existsSync(ymlPath)) throw new Error(`缺少 cordis.patch.yml：${ymlPath}`);
  const ymlOrig = fs.readFileSync(ymlPath, "utf8");
  const { text: ymlBase, removed } = stripManagedYml(ymlOrig);
  const ymlNext = `${ymlBase.replace(/\s*$/, "\n")}\n${companionBlock(pkgName)}\n`;
  if (!dryRun) {
    if (removed) fs.writeFileSync(`${ymlPath}.bak-opt-${Date.now()}`, ymlOrig, "utf8");
    fs.writeFileSync(ymlPath, ymlNext, "utf8");
  }
  console.log(`${dryRun ? "[dry] " : ""}write cordis.patch.yml (${removed ? "replace" : "append"} companion)`);

  console.log(`\n安装完成：${pkgName} @ ${target}`);
  console.log("下一步：完全退出 DSH → 重新打开 → 左侧 Purge → 状态 里点『应用』（会重写宿主补丁）→ 新开会话。");
  console.log("可选配置：$DSH_HOME/dsh-purge/opt.json，默认全开。");
}

function uninstall({ target, dryRun }) {
  const lib = ensureTarget(target);
  for (const name of COPY) {
    const dst = path.join(lib, name);
    if (!fs.existsSync(dst)) continue;
    if (!isInside(dst, target)) continue;
    if (!dryRun) fs.rmSync(dst, { force: true });
    console.log(`${dryRun ? "[dry] " : ""}remove lib/${name}`);
  }

  const pkgPath = path.join(target, "package.json");
  if (fs.existsSync(pkgPath)) {
    const meta = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    const exports = { ...(meta.exports || {}) };
    let changed = false;
    for (const k of ["./opt", "./opt-companion", "./opt-assemble"]) {
      if (k in exports) {
        delete exports[k];
        changed = true;
      }
    }
    if (changed && !dryRun) fs.writeFileSync(pkgPath, JSON.stringify({ ...meta, exports }, null, 2) + "\n", "utf8");
    if (changed) console.log(`${dryRun ? "[dry] " : ""}revert package.json exports`);
  }

  const ymlPath = path.join(target, "cordis.patch.yml");
  if (fs.existsSync(ymlPath)) {
    const orig = fs.readFileSync(ymlPath, "utf8");
    const { text, removed } = stripManagedYml(orig);
    if (removed) {
      if (!dryRun) {
        fs.writeFileSync(`${ymlPath}.bak-opt-uninstall-${Date.now()}`, orig, "utf8");
        fs.writeFileSync(ymlPath, text, "utf8");
      }
      console.log(`${dryRun ? "[dry] " : ""}remove companion from cordis.patch.yml`);
    }
  }
  console.log("\n卸载完成。重启 DSH 生效。");
}

const args = parseArgs(process.argv.slice(2));

if (args.help || (!args.target && !args.discover)) {
  console.log(`用法：
  node install.mjs --discover
  node install.mjs --target <dsh-purge 安装目录> [--dry-run]
  node install.mjs --target <dsh-purge 安装目录> --uninstall

典型目录：
  ~/.dsh/profiles/web/node_modules/dsh-purge
  ~/.dsh/profiles/web/node_modules/dsh-purge-community`);
  process.exit(args.help ? 0 : 2);
}

try {
  if (args.discover) {
    const found = discoverTargets();
    if (!found.length) console.log("未在 $DSH_HOME/profiles/*/node_modules 下找到 dsh-purge*");
    for (const f of found) console.log(`${f.name}@${f.version}\t${f.dir}`);
  } else if (args.uninstall) {
    uninstall(args);
  } else {
    install(args);
  }
} catch (error) {
  console.error(`失败：${error?.message || error}`);
  process.exit(1);
}
