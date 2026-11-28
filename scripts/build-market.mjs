/** Official DSH format-1 plugin market index generator for ZXEB/dsh-purge. */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO = "ZXEB/dsh-purge";
const MARKET_URL = "https://zxeb.github.io/dsh-purge/index.json";
const REPO_ROOT = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");

function inlineIconDataUrl() {
  const iconPath = path.join(REPO_ROOT, "docs", "icon.svg");
  const svg = fs.existsSync(iconPath)
    ? fs.readFileSync(iconPath, "utf8")
    : '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#1d4ed8"/><text x="32" y="45" text-anchor="middle" fill="#ffffff" font-size="40" font-weight="700" font-family="sans-serif">P</text></svg>';
  return `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;
}

export function buildMarket(
  releases,
  git = (args) => execFileSync("git", args, { cwd: REPO_ROOT, encoding: "utf8" }).trim(),
) {
  const versions = (releases || [])
    .filter((r) => r && !r.draft && !r.prerelease && /^v\d+\.\d+\.\d+$/.test(String(r.tag_name || "")))
    .map((r) => {
      const version = r.tag_name.slice(1);
      if (!r.assets?.some((a) => a.name === `dsh-purge-${version}.tgz`)) return null;
      const manifest = JSON.parse(git(["show", `${r.tag_name}:package.json`]));
      if (manifest.name !== "dsh-purge" || manifest.version !== version || !manifest.dsh?.bundle) {
        throw new Error(`Invalid bundle manifest at ${r.tag_name}`);
      }
      const commit = git(["rev-parse", `${r.tag_name}^{commit}`]);
      const publishTimestamp = Math.floor(Date.parse(r.published_at) / 1000);
      if (!/^[0-9a-f]{40}$/.test(commit) || !Number.isFinite(publishTimestamp)) {
        throw new Error(`Invalid release identity at ${r.tag_name}`);
      }
      const dshRange =
        manifest.engines?.dsh ||
        manifest.dsh?.compatibility?.dsh ||
        ">=0.2.0-rc.1 <0.3.0";
      return {
        version,
        publishTimestamp,
        source: {
          type: "git",
          url: `https://github.com/${REPO}`,
          commit,
        },
        engines: {
          dsh: dshRange,
        },
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.publishTimestamp - a.publishTimestamp);

  if (!versions.length) {
    throw new Error("No published market-qualified release with dsh-purge-<version>.tgz found");
  }

  return {
    format: 1,
    title: {
      en: "dsh-purge Plugin Index",
      zh: "dsh-purge 插件源",
    },
    description: {
      en: "Official DSH format-1 plugin index for ZXEB/dsh-purge (pinned to verified Git commits).",
      zh: "ZXEB/dsh-purge 正式发行插件索引源（全部版本固定到已发布 Git 提交）。",
    },
    plugins: [
      {
        name: "dsh-purge",
        title: {
          en: "dsh-purge",
          zh: "dsh-purge",
        },
        description: {
          en: "Local runtime adaptation plugin for DeepSeek Harness: reversible host patch table, prompt & rule management, side panel, and one-click apply/revert.",
          zh: "DeepSeek Harness 本地运行时适配插件：可回滚的宿主补丁表、提示词与规则集管理、侧栏面板及一键应用/还原/卸载。",
        },
        author: "ZXEB (adapted from original dsh-purge by YuJunZhiXue)",
        homepage: `https://github.com/${REPO}#readme`,
        repository: {
          url: `https://github.com/${REPO}`,
        },
        icon: inlineIconDataUrl(),
        versions,
      },
    ],
  };
}

function renderLandingHtml(latestVersion) {
  const tgzUrl = `https://github.com/${REPO}/releases/download/v${latestVersion}/dsh-purge-${latestVersion}.tgz`;
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>dsh-purge 插件源</title>
  <style>
    body { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; max-width: 760px; margin: 40px auto; padding: 0 20px; line-height: 1.65; color: #1f2937; }
    code, pre { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; background: #f3f4f6; border-radius: 6px; }
    code { padding: 2px 6px; }
    pre { padding: 14px 16px; overflow-x: auto; }
    .card { border: 1px solid #e5e7eb; border-radius: 12px; padding: 18px 20px; margin: 18px 0; }
    a { color: #1d4ed8; }
  </style>
</head>
<body>
  <main>
    <h1>dsh-purge 插件源（DSH 官方自定义市场索引）</h1>
    <p>最新版本：<strong>v${latestVersion}</strong> · 无第三方 npm 运行依赖，支持在 DeepSeek Harness 界面一键安装。</p>

    <div class="card">
      <h2>方式一：DSH 界面「发现 → 添加索引源」（推荐）</h2>
      <ol>
        <li>打开 DSH「插件 → 实验性插件 → 更多」，启用 <strong>自定义插件市场 / 自定义插件索引</strong>。</li>
        <li>切到「插件 → 发现 → 添加索引源」，粘贴下方完整网址：</li>
      </ol>
      <pre>${MARKET_URL}</pre>
      <p>保存后找到 <strong>dsh-purge</strong>，点击「安装」即可。</p>
    </div>

    <div class="card">
      <h2>方式二：DSH 界面「添加插件」或 CLI 直接填入安装包网址</h2>
      <pre>${tgzUrl}</pre>
      <p>或通过 CLI 安装（桌面端把 <code>web</code> 换成 <code>desktop</code>）：</p>
      <pre>dsh plugin --profile web add "${tgzUrl}"</pre>
    </div>

    <p>
      <a href="index.json">查看 index.json</a> ·
      <a href="https://github.com/${REPO}">GitHub 仓库与完整文档</a> ·
      <a href="https://github.com/${REPO}/releases/latest">最新 Release</a>
    </p>
  </main>
</body>
</html>
`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const input = process.argv.indexOf("--releases");
  let releases;
  if (input >= 0) {
    releases = JSON.parse(fs.readFileSync(process.argv[input + 1], "utf8"));
  } else {
    const headers = {
      "user-agent": "zxeb-dsh-purge-market",
      accept: "application/vnd.github+json",
    };
    if (process.env.GH_TOKEN) headers.authorization = `Bearer ${process.env.GH_TOKEN}`;
    const response = await fetch(`https://api.github.com/repos/${REPO}/releases?per_page=100`, {
      headers,
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw new Error(`Release list HTTP ${response.status}`);
    releases = await response.json();
  }

  const out = path.resolve(REPO_ROOT, process.env.MARKET_OUTPUT || "market-dist");
  const index = buildMarket(releases);
  const latestVersion = index.plugins[0].versions[0].version;
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, "index.json"), `${JSON.stringify(index, null, 2)}\n`);
  fs.writeFileSync(path.join(out, "index.html"), renderLandingHtml(latestVersion));
  console.log(`Generated ${index.plugins[0].versions.length} pinned market version(s), latest=${latestVersion}`);
}
