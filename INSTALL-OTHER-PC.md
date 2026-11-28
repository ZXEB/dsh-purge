# 在另一台电脑上安装（联网极简版 + 离线迁移清单）

## 推荐：目标机有网络时（1 分钟装完，无需拷文件）

1. 打开目标机的 DeepSeek Harness，进入 **「插件 → 发现 → 添加索引源」**（若无「发现」，先在「插件 → 实验性插件 → 更多」启用「自定义插件市场 / 自定义插件索引」）。
2. 粘贴以下网址并保存：
   ```text
   https://zxeb.github.io/dsh-purge/index.json
   ```
3. 搜索 **dsh-purge** 并点击 **「安装」**，重启 DSH 后在面板点击 **「适配 → 应用」** 即可。

也可以在 **「插件 → 添加插件」** 直接粘贴 `.tgz` 链接：
`https://github.com/ZXEB/dsh-purge/releases/download/v1.1.77/dsh-purge-1.1.77.tgz`

---

## 以下仅用于目标机完全离线（无法访问 GitHub）的场景

---

## 0. 先确认目标机的前提

| 检查 | 怎么确认 |
|---|---|
| 已装官方 DeepSeek Harness | 桌面版有 `DeepSeek Harness.exe`；命令行版有 `dsh` |
| 至少启动过一次 | 桌面版的 `profiles\desktop` 目录存在（没启动过就没有这个 profile） |
| Node.js ≥ 18 | `node --version` |
| 能写文件到目标盘 | 下面用 `D:\`，没有 D 盘就换一个**纯英文**路径 |

> ⚠ 路径里**不要有中文**。脚本会把插件复制到 ASCII 目录再安装，但 `DSH_HOME` 本身也尽量保持英文路径，能省掉一类 pnpm 报错。

---

## 1. 把离线安装包拷过去

从 [GitHub Releases](https://github.com/ZXEB/dsh-purge/releases/latest) 下载下面任意一个文件拷到目标机（U 盘 / 局域网 / 网盘都行）：

- **方式 A（推荐，最省事）**：下载 `dsh-purge-1.1.77.tgz` 放到纯英文路径（例如 `D:\dsh-plugins\dsh-purge-1.1.77.tgz`），直接执行：
  ```powershell
  dsh plugin --profile desktop add D:\dsh-plugins\dsh-purge-1.1.77.tgz
  ```
- **方式 B（使用本地脚本）**：下载 `dsh-purge-1.1.77.zip`，解压到**纯英文路径**，例如：

```text
D:\dsh-plugins\dsh-purge\
    ├─ package.json
    ├─ README.md
    ├─ check.ps1        ← 装前/装后都能跑的只读自检
    ├─ install.ps1
    ├─ lib\  bin\  client.js  ...
```

解压后确认这一层能直接看到 `package.json`。

---

## 1.5 先跑一遍只读自检（可选，但推荐）

它不改任何文件，只报告环境能不能装：

```powershell
powershell -ExecutionPolicy Bypass -File .\check.ps1 -Profile desktop
```

会逐项检查：PowerShell / Node 版本、dsh CLI 位置、`DSH_HOME` 候选、目标 profile 是否初始化、路径是否纯英文、是否已装过 dsh-purge、以及（装了以后）补丁状态统计。

最后一行是 `RESULT: ready.` 就可以往下走；出现 `[fail]` 就按提示先修环境（例如桌面版还没启动过、Node 太老）。

---

## 2. 关掉宿主

- 桌面版：托盘右键 → 退出（不是关窗口）。
- `dsh web`：停掉那个进程。

装的时候宿主必须是关着的，否则文件占用会导致安装半途失败。

---

## 3. 跑安装脚本

在解压出来的目录里打开 PowerShell：

```powershell
# 桌面版（最常见）
powershell -ExecutionPolicy Bypass -File .\install.ps1 -Profile desktop

# 命令行版 dsh web
powershell -ExecutionPolicy Bypass -File .\install.ps1 -Profile web
```

脚本会自己做这几件事：

1. 找到 `DSH_HOME` 与对应 `profiles\<desktop|web>`；
2. 把整份插件复制到 ASCII 暂存目录（默认 `D:\dsh-plugins\dsh-purge`，可用 `-StageDir` 改）；
3. 备份 `profile\package.json` 后调用 `dsh plugin add`；
4. 如果 `dsh plugin add` 不可用（找不到 CLI / pnpm 报错），自动改走手动注册：`$DSH_HOME\plugins\dsh-purge` + 写 profile（**无 BOM**）+ 建目录联接；
5. 打印补丁状态。

只想知道装没装、先不改任何东西：

```powershell
powershell -ExecutionPolicy Bypass -File .\install.ps1 -Profile desktop -StatusOnly
```

想连补丁一起应用：

```powershell
powershell -ExecutionPolicy Bypass -File .\install.ps1 -Profile desktop -Apply
```

`DSH_HOME` 不是默认位置时显式指定（例如桌面版自定义过数据目录）：

```powershell
powershell -ExecutionPolicy Bypass -File .\install.ps1 -Profile desktop -DshHome "D:\dsh-home"
```

---

## 4. 让它生效

1. **重新打开**宿主（桌面版双击 EXE；命令行 `dsh web`）。
2. 会话标题旁点 **dsh-purge** → **适配** → **应用**。
3. 应用成功后宿主会自重启一次；**重启后再新开一轮对话**，补丁才进入上下文。

第 3 步也可以用命令行代替：

```powershell
node D:\dsh-plugins\dsh-purge\bin\dsh-purge.js --apply
```

---

## 5. 验收

在目标机的宿主里逐条对照：

- [ ] 会话标题旁出现 **dsh-purge** 按钮，右侧栏能打开
- [ ] 聊天里 `/purge status` 打印的 `DSH_HOME` 是你这台机在用的那份
- [ ] 面板「适配」页里绝大多数条目是 `applied`（少数 `skipped` / `missing_file` 属正常）
- [ ] 模型侧能看到 `purge_status` / `purge_apply` / `purge_revert` 三个工具
- [ ] `node D:\dsh-plugins\dsh-purge\bin\dsh-purge.js --status` 能列出补丁表
- [ ] `check.ps1` 末尾给出 `summary: applied=NN pending=M`，且 pending 为 0

装完再跑一次自检即可看到这个汇总：

```powershell
powershell -ExecutionPolicy Bypass -File .\check.ps1 -Profile desktop
```

`skipped` 的典型原因：目标机 dsh 版本与本包 `dshTarget`（`0.2.2-rc.5`）不同，那段原文对不上 —— 条目保持原样，不会产生半改文件，可以忽略。
`missing_file` 的典型原因：对应的可选第三方包（mnemon / liangshen 等）没装，同样不影响其余条目。

---

## 6. 还原 / 卸载

```powershell
# 只还原 Host 产物，保留插件
powershell -ExecutionPolicy Bypass -File .\install.ps1 -Profile desktop -Revert

# 还原 + 移除插件登记
node D:\dsh-plugins\dsh-purge\bin\dsh-purge.js --uninstall
```

`prompt-inject.md`、`rules\`、`skills\` 是用户文件，还原与卸载都不会删。

---

## 7. 目标机常见报错

| 现象 | 原因 / 处理 |
|---|---|
| `'pnpm' is not recognized` | 目标机的 `dsh` 不是桌面自带 CLI。显式用 `-DshCli "<安装目录>\resources\runtime\cli\bin\dsh.cmd"`，或让脚本走手动注册（它会自动回退） |
| `ERR_PNPM_STORE_DIR_OPEN_OPERATION_LOCK` | 插件路径或 pnpm store 落在含中文/特殊字符的路径上。脚本已把两者都切到 ASCII；若手改过 `-StageDir`，改回纯英文路径 |
| 宿主启动报 `Unexpected token ... is not valid JSON` | `profiles\<name>\package.json` 被写进了 BOM。用编辑器「UTF-8 无 BOM」另存，或从同目录的 `package.json.bak-<时间戳>` 还原后重跑脚本 |
| `dsh plugin --profile desktop` 直接报错 | 桌面 profile 还没初始化：先启动一次桌面客户端、完全退出，再跑 |
| 装完没有 dsh-purge 按钮 | 装到了另一个 profile（Web / 桌面是两份 `DSH_HOME`）；或没重启；或只加了 `dependencies` 没加 `dsh.profile.bundles` |
| 点「应用」后行为没变 | 补丁要重启后才加载，注入在新会话才生效：应用 → 等自动重启 → 新开一轮 |
| 宿主更新后补丁没了 | `npm/pnpm` 覆盖了 `node_modules`。把 profile 配置里的 `autoApplyOnStart` 设为 `true`，或重跑一次 `--apply` |
