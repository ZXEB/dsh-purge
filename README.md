<p align="center">
  <img src="docs/banner.svg" alt="dsh-purge" width="720">
</p>

<h1 align="center">⚔️ dsh-purge — DeepSeek Harness 破甲 / 红队评测插件</h1>

<p align="center"><strong>镜像重建版 v1.1.71</strong></p>

<p align="center">
  <em>完整源码取自原仓库 <code>YuJunZhiXue/dsh-purge</code> v1.1.71（原仓库与 npm 包均已删除），本仓库只做保存与再分发，署名要求照旧。</em>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-1.1.71-1a73e8?style=flat" alt="version">
  <img src="https://img.shields.io/badge/license-MIT-65a30d?style=flat" alt="MIT">
  <img src="https://img.shields.io/badge/dsh-0.2.0--rc.2-blue" alt="dsh 0.2">
  <img src="https://img.shields.io/badge/Node.js-%3E%3D18-339933?logo=node.js&logoColor=fff" alt="Node.js">
</p>

<p align="center">
  <a href="README.md">中文</a> | <a href="README.en.md">English</a>
</p>

> **这是一个「提取完整版」仓库。** 原作者的 GitHub 仓库已删、npm 上的 `dsh-purge` 也已 404，所以 **`dsh plugin add dsh-purge` 这种按包名安装的方式现在装不上**，必须按本文的 **tarball / 本地目录 / 手动** 三种方式装。装完必须重启宿主，并在「清洗 → 应用」里点一次，才会有实际效果。

---

## 目录

- [一、这是什么](#一这是什么)
- [二、能力总览](#二能力总览)
- [三、环境要求](#三环境要求)
- [四、安装（重点）](#四安装重点)
  - [4.0 先确认你要装到哪个宿主](#40-先确认你要装到哪个宿主)
  - [4.1 方式 A：从本仓库 tarball 一键安装（推荐）](#41-方式-a从本仓库-tarball-一键安装推荐)
  - [4.2 方式 B：本地目录安装（离线可用）](#42-方式-b本地目录安装离线可用)
  - [4.3 方式 C：手动安装（CLI 装不上时兜底）](#43-方式-c手动安装cli-装不上时兜底)
  - [4.4 方式 D：Release 压缩包](#44-方式-drelease-压缩包)
  - [4.5 `dsh` 不在 PATH 怎么办](#45-dsh-不在-path-怎么办)
  - [4.6 安装后的三步（不做等于没装）](#46-安装后的三步不做等于没装)
  - [4.7 安装验证清单](#47-安装验证清单)
- [五、目录结构与运行时文件](#五目录结构与运行时文件)
- [六、使用](#六使用)
- [七、配置项](#七配置项)
- [八、工作原理](#八工作原理)
- [九、更新、还原、卸载](#九更新还原卸载)
- [十、常见问题（FAQ）](#十常见问题faq)
- [十一、兼容性](#十一兼容性)
- [十二、声明、署名与许可](#十二声明署名与许可)

---

<a id="一这是什么"></a>

## 一、这是什么

`dsh-purge` 是给**本机已安装的官方 DeepSeek Harness** 用的红队 / 鲁棒性评测插件。它不改模型，改的是**宿主层**：Harness 在运行时重写提示词、审批闸门、沙箱策略、会话迁移，所以「模型不答」很多时候不是模型拒绝，而是宿主层拦住了。这个插件把这两层分开，让你在自己的安装上做受控评测。

| 你会得到 | 作用 |
|---|---|
| **dsh-purge 侧栏** | 会话标题旁的按钮，右侧栏两页：**清洗** / **演练台** |
| **清洗** | 分组显示补丁状态，应用 / 还原 / 卸载，提示词编辑，多套规则集 |
| **演练台** | 授权后的资产、技能、本机环境页（只用于你自管主机、离线靶标或书面授权演练） |
| **宿主策略** | 默认文案、权限策略、工具上限；官方能力保留，不另造身份 |
| **启动自检** | 每次启动检查并重新应用；npm/pnpm 覆盖 `node_modules` 后不用手改文件 |

支持官方 **Web（`dsh web`）** 和官方 **桌面 EXE**，两个宿主**分别安装、分别应用**，不要交叉点。

不写死盘符：先看 `$DSH_HOME`，再看 dsh 启动器旁的 `.dsh`，最后回落 `~/.dsh`。不改 Harness 源码树，只改本机 `@deepseek-ai/*` 包产物与用户目录下的覆盖文件。

---

<a id="二能力总览"></a>

## 二、能力总览

- **补丁（清洗）**：按组列出每个补丁的 `applied / pending / missing_file` 状态；重复应用幂等。
- **提示词注入**：默认注入插件内**加密内置**的那份（提示词框默认显示的内容），不读宿主磁盘；也可自己编辑 `$DSH_HOME/prompt-inject.md` 覆盖。
- **规则集**：多套 `AGENTS.md` / `CLAUDE.md`，启用即写入 `$DSH_HOME`，删除只从列表移除。
- **Skill**：导入压缩包或文件夹到当前宿主的 `$DSH_HOME/skills/<id>/SKILL.md`，由 DSH 自己加载；卸载插件不删你的 Skill。
- **自己的服务器**：每行登记一台 IP 或完整主机名，写入 `$DSH_HOME/net-scope-allow.txt`；密钥、密码、网段、通配符保存时会被丢掉。
- **回退**：输入框旁「回退一次 / 回退上一轮」，已发送内容回到输入框，可从当前这一轮重来；聊天里 `/rewind` 等价。
- **演练台**：首次进入需读声明、等倒计时、滚到文末、勾选三项，之后才可用；清洗不需要这一步。
- **自动重试 / 续跑**：`autoRetry` 失败重试、`autoContinue` 自动续跑，次数可配。

---

<a id="三环境要求"></a>

## 三、环境要求

| 项 | 要求 |
|---|---|
| dsh | **0.2.x**，本包 `dshTarget` 为 `0.2.0-rc.2`（0.1.x 不要用，会显示跳过或版本不匹配） |
| 宿主 | 官方桌面 EXE（profile `desktop`）或官方 `dsh web`（profile `web`） |
| Node.js | **≥ 18**；Windows 下要「无闪窗」需要 **≥ 22** |
| 包管理器 | 用 dsh 自带的 pnpm（`dsh plugin` 会调用它），不必单独装 |
| 网络 | 首次安装需要能访问 GitHub；离线时用[方式 B](#42-方式-b本地目录安装离线可用)/[方式 C](#43-方式-c手动安装cli-装不上时兜底) |

---

<a id="四安装重点"></a>

## 四、安装（重点）

### 4.0 先确认你要装到哪个宿主

| 你在跑 | profile | 说明 |
|---|---|---|
| 官方桌面 EXE（DeepSeek Harness 0.2.0-rc.2） | `desktop` | profile 必须**先启动过一次客户端**才生成，安装前要**完全退出**（托盘右键退出） |
| 官方 `dsh web` | `web` | 停掉正在跑的 `dsh web` 再装 |

确认 `$DSH_HOME` 是不是你实际在用的那一份（本机常有两份 `.dsh`）：

```powershell
# Windows PowerShell
$cands = @()
if ($env:DSH_HOME) { $cands += $env:DSH_HOME }
$cands += "$env:USERPROFILE\.dsh"
$cands += @("$env:APPDATA\DeepSeek Harness\dsh-home", "$env:LOCALAPPDATA\DeepSeek Harness\dsh-home")
$cands | Select-Object -Unique | Where-Object { $_ -and (Test-Path (Join-Path $_ "profiles")) }
```

```sh
# macOS / Linux
ls -d "${DSH_HOME:-$HOME/.dsh}"/profiles 2>/dev/null
```

进到 `profiles/<web|desktop>/package.json`，`"name"` 应该是 `dsh-profile-web` 或 `dsh-profile-desktop`。

---

### 4.1 方式 A：从本仓库 tarball 一键安装（推荐）

联网、`dsh` 可用时最省事：

```powershell
# Web 宿主
dsh plugin --profile web add https://github.com/ZXEB/dsh-purge/archive/refs/heads/master.tar.gz

# 桌面宿主（先完全退出桌面客户端）
dsh plugin --profile desktop add https://github.com/ZXEB/dsh-purge/archive/refs/heads/master.tar.gz
```

macOS / Linux 同一条命令。

装完 profile 的 `package.json` 里会多出一条依赖：

```json
"dsh-purge": "https://github.com/ZXEB/dsh-purge/archive/refs/heads/master.tar.gz"
```

同时在 `dsh.profile.bundles` 末尾自动登记 `dsh-purge`。**两条都在 = 装对了。**

> 仓库已把 `package.json` 的 `repository / homepage / bugs / dsh.install` 全部指向 `ZXEB/dsh-purge`，所以「检查更新」与面板里的仓库链接都走本仓库，不会再打原来的死链。

---

### 4.2 方式 B：本地目录安装（离线可用）

已经 clone / 解压到本地时，直接把目录当包源：

```powershell
# 目录里必须能直接看到 package.json（即 dsh-purge 仓库根）
dsh plugin --profile desktop add D:\path\to\dsh-purge
```

```sh
dsh plugin --profile web add /path/to/dsh-purge
```

当前 shell 就在仓库根时也可以：

```sh
dsh plugin --profile web add .
```

离线拷贝要拷**整个目录**（`lib/ client.js docs/ presets/ skills/ bin/`），不要只拷几个 `.js` —— `client.js` 是侧栏前端产物，缺了就只有命令行、没有面板。

---

### 4.3 方式 C：手动安装（CLI 装不上时兜底）

只改**正在用的那个宿主**对应的 profile，不要动另一个，也不要删原有 bundle。

**第 1 步：把插件放进 `$DSH_HOME/plugins/dsh-purge`**

目录名必须是 `dsh-purge`，里面 `package.json` 的 `"name"` 也必须是 `dsh-purge`。

```sh
git clone https://github.com/ZXEB/dsh-purge.git "$DSH_HOME/plugins/dsh-purge"
```

没有 git 就下载 [master.tar.gz](https://github.com/ZXEB/dsh-purge/archive/refs/heads/master.tar.gz)，解压后把 `dsh-purge-master` 改名成 `dsh-purge`，整夹放进 `plugins/`。

**第 2 步：备份并修改 profile 的 `package.json`**

Web → `$DSH_HOME/profiles/web/package.json`；桌面 → `$DSH_HOME/profiles/desktop/package.json`。**只追加两处**：

1. `dependencies` 增加 `"dsh-purge": "file:../../plugins/dsh-purge"`
2. `dsh.profile.bundles` **末尾**追加 `"dsh-purge"`（已有就别重复加）

```json
{
  "name": "dsh-profile-web",
  "private": true,
  "dependencies": {
    "dsh-purge": "file:../../plugins/dsh-purge"
  },
  "dsh": {
    "profile": {
      "bundles": [
        "@deepseek-ai/dsh-base",
        "@deepseek-ai/dsh-web-app",
        "dsh-purge"
      ]
    }
  }
}
```

JSON 必须合法（新增项前有逗号、最后一项后没有多余逗号）。`file:` 保持相对路径；`patchReload`、其它插件、版本号都别动。

**第 3 步：只在刚改的那个 profile 目录里装依赖**

```sh
cd "$DSH_HOME/profiles/web"    # 或 profiles/desktop
pnpm install
```

成功标志：出现 `profiles/<web|desktop>/node_modules/dsh-purge/package.json`。报 `Could not resolve` 就查 `file:` 路径；JSON 解析失败就修逗号或还原备份。

**第 4 步**：见 [4.6](#46-安装后的三步不做等于没装)。

---

### 4.4 方式 D：Release 压缩包

仓库推 `master` 会由 GitHub Actions 自动出 Release（附件 = `dsh-purge-<version>.zip`）。下载解压后：

- 想用命令行 → 按[方式 B](#42-方式-b本地目录安装离线可用) 指向解压目录；
- 命令行不方便 → 按[方式 C](#43-方式-c手动安装cli-装不上时兜底) 放进 `plugins/` 再手改 profile。

---

### 4.5 `dsh` 不在 PATH 怎么办

桌面版自带一份 CLI，Windows 通常在安装目录下：

```
<安装目录>\resources\runtime\cli\bin\dsh.cmd
```

例如 `D:\dsh\resources\runtime\cli\bin\dsh.cmd`。直接用它，参数完全一致：

```powershell
& "D:\dsh\resources\runtime\cli\bin\dsh.cmd" plugin --profile desktop add D:\path\to\dsh-purge
```

先 `Get-Command dsh` 看一眼有没有；没有就用上面的绝对路径。

---

### 4.6 安装后的三步（不做等于没装）

```mermaid
flowchart LR
  A["加入 profile<br/>（方式 A/B/C/D）"] --> B["完全退出并重开宿主"]
  B --> C["会话标题旁 dsh-purge →<br/>清洗 → 应用"]
  C --> D["成功会自重启一次<br/>重启后新开对话"]
```

1. **完全退出并重开**你装的那个宿主：桌面端托盘退出再开；`dsh web` 停进程再启动。
2. 在**那个宿主**上点会话标题旁的 **dsh-purge** → **清洗** → **应用**（不在设置页里）。
3. **应用成功会自重启一次**（补丁要重启后才加载）；没跑完就不会重启。

> Web 的开关只影响 Web，桌面的开关只影响桌面。不要在一个宿主里给另一个宿主点应用。

---

### 4.7 安装验证清单

- [ ] `profiles/<web|desktop>/package.json` 里同时有 `dependencies.dsh-purge` 和 `dsh.profile.bundles` 里的 `dsh-purge`
- [ ] `profiles/<web|desktop>/node_modules/dsh-purge/package.json` 存在
- [ ] 宿主界面会话标题旁出现 **dsh-purge** 按钮，右侧栏能打开
- [ ] 聊天里 `/purge status` 打印 `DSH_HOME` 与补丁列表，且路径是你实际在跑的那份
- [ ] 模型侧有 `purge_status` / `purge_apply` / `purge_revert` 三个工具（说明 bundle 已加载）
- [ ] `node <插件>/bin/dsh-purge.js --status` 能列出补丁状态

可选包（例如 liangshen 相关）没装时显示 `skipped`，不阻塞应用，属正常。

---

<a id="五目录结构与运行时文件"></a>

## 五、目录结构与运行时文件

仓库：

| 路径 | 说明 |
|---|---|
| `bin/dsh-purge.js` | CLI 入口（`--status / --apply / --revert / --uninstall / --edit`） |
| `lib/` | 补丁引擎、路径探测、shim 注入、更新、卸载、演练台（`lib/redteam/`） |
| `lib/asset-table.js` | 内置加密提示词（由 `scripts/embed-default-prompt.mjs` 生成） |
| `client.js` | 右侧栏前端产物（构建自 `scripts/build-client.mjs`） |
| `cordis.patch.yml` | bundle patch：注册 `dsh-purge`、`dsh-purge/redteam`、`store`、`ui` 四个入口 |
| `presets/redteam/` | 红队预设（`agent.cordis.yml`、`anchor-gate.mjs`、`preset.yml`） |
| `skills/redteam/` | 随包技能（侦察、扫描、隧道、口令、横向、报告等） |
| `docs/` | banner、预览图、演练授权声明页、上游许可与披露文件、`docs/upstream/` 原版 README |
| `scripts/` | 构建 / 嵌入 / 补丁脚本（`build-client.mjs`、`patch-client-dock.mjs`、`embed-default-prompt.mjs`、`redteam-setup.sh`） |

运行时（`$DSH_HOME` 下，Web 与桌面各一份）：

| 文件/目录 | 说明 |
|---|---|
| `prompt-inject.md` | 会话覆盖段；用户文件，还原时保留 |
| `rules/` | 规则集（`AGENTS.md` / `CLAUDE.md`） |
| `skills/<id>/SKILL.md` | 导入的技能 |
| `net-scope-allow.txt` | 「自己的服务器」白名单 |
| `redteam/` | 演练台事实库（SQLite） |
| `dsh-purge/` | 插件状态：`applied.json`、`override-state.json`、`installed-rev`、`drill-grant.json` 等 |

---

<a id="六使用"></a>

## 六、使用

```sh
# 命令行
dsh-purge --status       # 宿主、DSH_HOME、补丁 applied/pending、shim、备份
dsh-purge --apply        # 应用全部补丁（提示词 + 代码 + shim + override）
dsh-purge --revert       # 回滚还原
dsh-purge --uninstall    # 卸载（已应用则先还原）
dsh-purge --edit         # 编辑注入文件 prompt-inject.md
dsh-purge --help

# 聊天命令
/purge status | apply | revert | uninstall | edit | help
/rules list | use <id> | create <id> | delete <id> | reset | help
/skills list | import <压缩包或文件夹> | create <id> [说明] | delete <id> | help
/rewind

# 模型工具
purge_status   purge_apply   purge_revert
```

面板：**清洗** 页从上到下是补丁状态、提示词、自己的服务器、规则集、Skill；**演练台** 页首次进入需授权确认（读声明 → 等倒计时 → 滚到文末 → 勾三项）。

`/rewind` 与输入框旁的「回退一次 / 回退上一轮」：已发送内容回到输入框，这一轮已发出的内容与已完成任务从当前对话撤掉，改完**重新发送**即可；多轮对话后按**当前这一轮**定位。回退留在当前对话，不另开分支。

---

<a id="七配置项"></a>

## 七、配置项

改 `$DSH_HOME/profiles/<web|desktop>/cordis.patch.yml` 里的 `dsh-purge` 条目，**重启宿主**生效。仓库自带默认值：

```yaml
- insert:
    - id: dsh-purge
      name: 'dsh-purge'
      inject: [systemPrompt, tools]
      config:
        enabled: true                 # 插件总开关
        autoApplyOnStart: false       # 启动时自动应用补丁（默认关；开了才每次启动自检重应用）
        autoUpdateOnStart: false      # 启动时检查更新
        autoRevertOnMissing: false    # 保留字段
        injectOnce: false             # 保留字段
        stripMnemon: true             # 去掉 mnemon 段
        verbose: false                # 控制台详细日志
        postPrompt: ""                # 额外提示段（默认空）
        postPromptOrder: 5100         # 需大于内置全局顺序，否则该段被跳过
        autoRetry: true               # 失败自动重试
        retryMax: 3
        autoContinue: false           # 自动续跑
        continueMax: 3
        continueText: "继续"
        capabilityProtocol: true      # 注入能力协议段
        hooksDenyBypass: true         # 跳过 hooks 拒绝拦截
    - id: dsh-purge-redteam
      name: dsh-purge/redteam
    - id: dsh-purge-redteam-store
      name: dsh-purge/redteam/store
      config:
        root: !!js dshHomePath('redteam')
    - id: dsh-purge-redteam-ui
      name: dsh-purge/redteam/ui
```

profile 层的 `cordis.patch.yml`（用户 patch 层）在内置配置之后加载，后续应用插件会保留你的 `insert`，不会被旧备份覆盖。

---

<a id="八工作原理"></a>

## 八、工作原理

应用（启动自检或手动点「应用」）：

```mermaid
flowchart TD
  A["启动或点应用"] --> B{"补丁已生效?"}
  B -->|是| C["跳过（幂等）"]
  B -->|否| D["目标文件备份为 <文件>.dshpurge.bak"]
  D --> E["按补丁列表替换对应文件"]
  E --> F["覆盖 / 注入 shim（dsh.cmd / dsh.ps1 / dsh）"]
  F --> G["注入插件内置加密提示词"]
```

每轮会话的提示词来源优先级：`prompt-inject.md`（非空）→ 当前目录被勾选且非空的本地 md → 插件内置加密默认值；再由 workspace baseline 策略（`strict` / `fallback` / `always`）决定是否保留 DSH 的 baseline 段。Skill **不进**注入段，也不顶替提示词。

---

<a id="九更新还原卸载"></a>

## 九、更新、还原、卸载

**更新**（本仓库 tarball 安装时最稳）：

```powershell
dsh plugin --profile desktop remove dsh-purge
dsh plugin --profile desktop add https://github.com/ZXEB/dsh-purge/archive/refs/heads/master.tar.gz
# 然后完全退出宿主 → 重开 → 清洗 → 应用
```

面板里也有「更新 / 切换到正式版」，读的是本仓库（`package.json` 的 repository / homepage 已指向 `ZXEB/dsh-purge`）。发新版流程：改 `package.json` 版本号 → `release-notes.md` 首行写 `# <版本>` → 推 `master`，Actions 自动出 Release 与 zip。

**还原**（保留插件，只回原版宿主）：

```sh
dsh-purge --revert        # 或 /purge revert，或面板「还原」
```

- 每个目标文件应用前备份为 `<文件>.dshpurge.bak`；还原用备份覆盖回去并删除备份；没有备份时只去掉 shim 里由本插件写入的行。
- `prompt-inject.md` 是用户文件，还原时保留。

**卸载**：

```sh
dsh-purge --uninstall     # 或 /purge uninstall，或面板「清洗 → 卸载」
```

会先还原（若已应用）再删除注入文件、规则库与插件本身，然后重启宿主。

---

<a id="十常见问题faq"></a>

## 十、常见问题（FAQ）

**1. `dsh plugin add dsh-purge` 报 404 / 装不动**
原 npm 包已下架。改用 [方式 A](#41-方式-a从本仓库-tarball-一键安装推荐) 的 tarball 地址，或 [方式 B](#42-方式-b本地目录安装离线可用) / [方式 C](#43-方式-c手动安装cli-装不上时兜底)。

**2. `dsh plugin` 报 `pnpm was not found`**
用 dsh 自带 CLI（`resources\runtime\cli\bin\dsh.cmd`），它会带内置 pnpm；自己装的话确保 pnpm 在 PATH。

**3. 报 `plugin command failed`**
看它给出的 `logPath`。常见是网络、profile JSON 写坏、`file:` 路径不对。

**4. 报版本不匹配（incompatible）**
本包 `dshTarget` 是 `0.2.0-rc.2`。确认 dsh 是 0.2.x；确实要冒险跨版本按提示执行：

```sh
dsh plugin --profile web allow-version dsh-purge@1.1.71 --dsh-version <你的精确版本> --accept-risk
```

**5. pnpm 提示 `allowBuilds`（git 依赖的 prepare 脚本被拦）**
把提示给出的确切键写进 `profiles/<p>/pnpm-workspace.yaml` 的 `allowBuilds` 再重跑。tarball / 本地目录安装不触发这条。

**6. 桌面端 `dsh plugin --profile desktop ...` 直接报错**
桌面 profile 还没初始化：先启动一次桌面客户端，**完全退出**后再跑命令。

**7. 装好了但会话标题旁没有 dsh-purge**
- 装错宿主了（Web / 桌面各一份 `.dsh`，见 [4.0](#40-先确认你要装到哪个宿主)）；
- 没重启宿主；
- profile 里少了 `dsh.profile.bundles` 里的 `dsh-purge`（只加依赖不会加载）；
- `client.js` 没跟着拷过去（侧栏前端产物缺失）。

**8. 点了「应用」但模型行为没变**
补丁要**重启后**才加载，注入**在开新会话时**才进入上下文。正确顺序：应用 → 等自动重启 → 新开一轮对话。只换 preset 不重新应用，旧进程里的补丁不会更新。

**9. 状态里全是 `pending` / `missing_file`**
宿主被升级或换了安装目录，原文对不上就显示跳过（不会乱改）。重装插件后再应用一次；确实缺文件的补丁可以忽略，其余仍能完成。

**10. npm/pnpm 把 `node_modules` 覆盖了，补丁没了**
把 `autoApplyOnStart` 设成 `true`，或每次更新后点一次「应用」；插件启动自检会重新应用。

**11. 想完全恢复原版 Harness**
先「还原」再「卸载」，然后清掉 `$DSH_HOME` 下的 `dsh-purge/` 状态目录。`prompt-inject.md`、`rules/`、`skills/` 是你的文件，会留着。

**12. 能在别的机器 / 别的 dsh 客户端用吗**
可以，插件只与本机 `@deepseek-ai` 包和 `$DSH_HOME` 交互。换机器按第四节装一遍，宿主版本对上即可。

---

<a id="十一兼容性"></a>

## 十一、兼容性

| 插件版本 | 适配 dsh | 说明 |
|---|---|---|
| **1.1.71**（本仓库） | **0.2.x**（官方桌面 0.2.0-rc.2 / 官方 `dsh web`） | 完整提取版 |
| 1.1.40 及以上 | 0.2.x | 原仓库同线版本 |
| 1.1.39 及以下 | 0.1.7（含 rc.1 / rc.2） | 原仓库旧线，本仓库不含 |

不适配的补丁不会被盲改，只会 `pending` / `skipped`。

---

<a id="十二声明署名与许可"></a>

## 十二、声明、署名与许可

**署名要求（沿用原作者条款）**：借用本项目的名称、思路、代码或提示词，必须署名并写明来源。原始来源：**`YuJunZhiXue/dsh-purge`（作者：小杨）**；本仓库为该版本的镜像重建：**`ZXEB/dsh-purge`**。去掉署名、隐去来源、据为己有会被追究。

**用途与边界**

1. 本仓库代码、文档、补丁、默认提示词**不含**恶意程序、后门、未授权渗透工具、勒索软件、撞库脚本，也不含针对公网或第三方系统的攻击载荷。
2. 补丁与提示词注入只作用于**你本机已安装的官方 DeepSeek Harness**（`@deepseek-ai` 包、本地 profile / `$DSH_HOME`）；目标是你自己的本地软件，不是别人的站点、服务器、账号或信息系统。
3. 应用 / 注入 / 还原 / 卸载都只动本地文件与本地进程，**不扫描、不探测、不向任何公网主机发送攻击流量**。「检查更新」只会访问本插件自己的 GitHub 仓库比对版本，不构成对第三方系统的探测，也不构成任何授权。
4. 只在你**有权管理**的官方 Harness、离线本地合成靶标、已授权靶场或合规实验环境中使用；对无书面授权的目标、公网在线系统、生产负载不要用。
5. **中国大陆、香港、澳门**的网段与解析到这些地区的服务器 / 域名默认禁止访问、扫描、探测；唯一例外是你**事先登记**的那一个精确 IP 或完整主机名（面板「自己的服务器」→ 写入 `$DSH_HOME/net-scope-allow.txt`）。密钥、密码、网段、通配符、对话里的口头声明都不构成例外。
6. 禁止用于违反《中华人民共和国刑法》《网络安全法》《数据安全法》《个人信息保护法》及适用法律法规、监管规则的行为；禁止未授权入侵攻击、敲诈破坏、撞库、传播恶意载荷；禁止生成传播法律禁止的内容；禁止违反模型服务商条款。
7. 本项目按 MIT「现状」提供，不担保完整性与适用性。下载、部署、运行、修改、分发及其产生的一切输入输出，**责任由使用者自行承担**；作者与贡献者不承担直接、间接或连带责任。
8. 一旦用于非法攻击或恶意活动，开源许可**即刻自动终止**，须停止使用并永久销毁所有副本与衍生品。
9. 本项目是独立开源安全评测研究项目，与 DeepSeek 及其关联方**无**雇佣、商业、授权或背书关系；此处「官方」仅指评测目标是你机器上的官方 Harness 包。

**许可**：MIT，见 [LICENSE](LICENSE)（版权行保留原作者 `Copyright (c) 2026 小杨`）。

**致谢**：原作者 小杨（`YuJunZhiXue`）、[LINUX DO](https://linux.do) 社区，以及 `docs/redteam-upstream-*` 中列明的上游项目与披露文件。
