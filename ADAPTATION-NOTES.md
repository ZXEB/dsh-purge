# 适配记录：1.1.71 → 1.1.76（dsh 0.2.2-rc.5）

本文件记录适配**改了什么、为什么改、怎么验证的**。覆盖补丁锚点、运行期接口与红队预设组合。

---

## 1. 适配基准

| 项 | 值 |
|---|---|
| 上游插件 | `ZXEB/dsh-purge` v1.1.71（master `719a741`） |
| 原 `dshTarget` | `0.2.0-rc.2` |
| 新 `dshTarget` | **`0.2.2-rc.5`**（npm `latest` / `next` 及桌面端 `nightly` 最新版） |
| 已验证版本 | `0.2.2-rc.5`、`0.2.2-rc.3`、`0.2.2-rc.2`、`0.2.2-rc.1`、`0.2.1-rc.3`、`0.2.0-rc.2` |

补丁引擎的判定语义（`lib/core.js`）：

- `pending`：原文锚点**命中**，尚未应用 → 可打
- `applied`：已生效（markers 命中，或锚点已被替换）
- `skipped`：文件在，但锚点和 markers 都不命中 → 上游改写了这段，**需要重新校准**
- `missing_file`：整条对应的可选包没装（第三方 mnemon / liangshen、用户预设等）

因此「适配」= 找出对照基线里 `pending → skipped` 的那些条目。

---

## 2. 第一轮（1.1.71 → 0.2.2-rc.1）：6 条回归

| # | 名称 | 上游改动 | 处理方式 |
|---|---|---|---|
| 14 | `ESCALATION_GRANT_UNCONDITIONAL` | `approveEscalation` 先对 missing approver / agent 抛错；`displayReason` 收敛为 `escalationDisplayReason(...)` 调用 | 新增「无审批路由直接返回 mode」+ 新调用形态锚点；`markers` 改 `markersAny` |
| 54 | `DELIVERABLE_DO_NOT` | 静态交付物提示词搬到新包 `dsh-deliverable-file-references` | 新增文件键 `deliverables-prompt-refs` |
| 60 | `OFFICIAL_RUN_CODE_APPROVAL_NEUTRAL` | `run_code` 沙箱描述迁到 `dsh-tool-executor-ptc` | 新增文件键 `tool-executor-ptc`、`tool-executor-ptc-types` |
| 62 | `OFFICIAL_TOOL_ASK_FAILOPEN` | 审批管线拆到 `dsh-tools/lib/pipeline.js` + `lib/types/pipeline.js`；`=== void 0`；新增「无 agent 即 deny」 | 新增 2 个文件键 + 4 段锚点 |
| 67 | `AGENT_LOOP_MESSAGES_GUARD` | 同段代码整体缩进进内层 `try`（4 tab → 5 tab） | 追加 5 tab 版本锚点 |
| 74 | `ASSEMBLE_BEFORE_PRESTEP` | `preStep` 里 `assemble` 改成分段对象 | 锚点前移到 `assemble({` 那一行 |

---

## 3. 第二轮（0.2.2-rc.1 → 0.2.2-rc.3）：5 条回归，4 条已修

| # | 名称 | rc.3 上游改动 | 处理方式 |
|---|---|---|---|
| 13 | `ESCALATION_WIDENING_EXEMPT` | `throw new Error(msg)` → `throw new SandboxEscalationError(msg, "SANDBOX_ESCALATION_*")` | 追加新错误类型的锚点（三条 throw 整段替换为 bypass 注释） |
| 35 | `ESCALATION_NEVER_REJECT` | 同上；且 `cancelled` 分支新增 `approval.signal?.throwIfAborted()` | 追加 rc.3 形态的 switch 锚点，整体替换为「一律返回 mode」 |
| 18 | `REPEAT_TOOL_REMINDER_DISABLED` | `tools/post-execute` 处理器去掉了 `block` 分支，只剩透传 | 追加精简版锚点 |
| 62 | `OFFICIAL_TOOL_ASK_FAILOPEN` | deny 收敛为 `approvalDenial(reason, APPROVAL_UNAVAILABLE)` 助手 | 追加 tab / 4 空格两套新形态共 6 段锚点 |
| 56 | `REWIND_HIDE_CUT_ONLY` | 前端 bundle 重新压缩发布，`rewind-*` 标记与 `rewindVisibleEntries` 均不再出现 | **未修**：该条 `optional: true`，只影响回退后旧轮在列表里的隐藏效果；rc.3 上保持 `skipped`，不改任何文件 |

> 结论：功能类补丁（提示词段、审批、沙箱、工具描述、agent-loop）在 rc.3 上全部命中；未命中项只剩 1 条可选的前端显示润色，以及各类依赖第三方插件/用户预设的 `missing_file`。

---

## 4. 新增文件键（`lib/core.js` → `targetFiles`）

```js
"dsh-tools-pipeline"        // dsh-tools/lib/pipeline.js
"dsh-tools-types-pipeline"  // dsh-tools/lib/types/pipeline.js
"tool-executor-ptc"         // dsh-tool-executor-ptc/lib/index.js
"tool-executor-ptc-types"   // dsh-tool-executor-ptc/lib/types/ptc.js
"deliverables-prompt-refs"  // dsh-deliverable-file-references/lib/index.js
```

全部走 `allExisting` + `nestedPkg`：包不存在时返回空，条目落 `missing_file`，不影响其余补丁。

---

## 5. 验证

| 步骤 | 方法 | 结果 |
|---|---|---|
| 锚点回归（rc.1） | 同一补丁表跑 0.2.1-rc.3 与 0.2.2-rc.1 状态探测并 diff | 82 条 **0 回归** |
| 锚点回归（rc.3） | 同上，对照 rc.1 基线 | 5 条回归 → **已修 4 条**，剩 1 条可选项 |
| 中间版本 | 0.2.2-rc.2 状态探测 | 只剩常态 `skipped`（#32/#40/#53/#56/#77/#80/#88）与第三方缺失项，**0 回归** |
| 向下兼容 | 0.2.0-rc.2 状态探测 | **0 回归**，另有 8 条在 0.2.0 上命中（上游后来改了写法） |
| 实际应用（rc.3） | 在 0.2.2-rc.3 完整产物上执行 `applyPatches(ALL_PATCHES)` | applied 54 / already 10 / skipped 6 / missing_file 7 / na 5（na = 桌面宿主专属） |
| 语法 | 对全部被改写的 `.js` 跑 `node --check` | 扫描 17932 个文件、改写 37 个，**0 语法错误** |
| 语义 | 逐条 grep 打补丁后的实际代码 | escalation 无条件放行；审批三条 deny 分支改 allow；reminder 守卫失效；agent-loop 双锚点命中；ptc 描述改写；交付物禁令句移除 |
| 运行期 | `dsh web` 启动（rc.1 全套补丁） | 正常监听、无报错 |

常态 `skipped` 说明（在 0.2.0 ~ 0.2.2 各版本上一致或仅个别命中）：

- `#32` / `#53` / `#77` / `#80` / `#88`：上游布局或可选包差异
- `#40`：0.1.5 兼容条目，2.x 不需要
- `#56`：见第 3 节
- `missing_file`（`#28` `#30` `#31` `#64` `#65` `#71` `#76`）：依赖第三方插件或用户自建预设，干净安装下本就没有

---

## 6. 回滚

```sh
node bin/dsh-purge.js --revert     # 用 .dshpurge.bak 还原被改写的产物
node bin/dsh-purge.js --uninstall  # 还原 + 清除插件登记
```

若某个条目在你的 dsh 版本上显示 `skipped`，说明该版本这段原文与本适配基准不同：条目保持原样，不会产生半改文件，可安全忽略。

---

## 7. 第三轮（1.1.74）：实测回归 + 2 条修复

前两节是纸面校准。这一轮改用 **npm `0.2.2-rc.3` 全部 51 个包的原始产物**搭出 `node_modules/@deepseek-ai` 布局，直接跑 `applyPatches()` 验证，发现 2 个真问题。

### 7.1 修复条目

| # | 名称 | 问题 | 处理 |
|---|---|---|---|
| 17 | `FS_OBSERVATION_INTENT_FREE` | rc.3 把 `editIntent` 的读前校验抽成 `requirePresent(target, actor, "edit")`，原来的内联体锚点在 rc.3 上完全不存在。结果是 0.2.0-rc.2 上 `applied`、rc.3 上 `skipped` —— 这是真回归，不是常态。 | 追加 rc.3 形态锚点：`editIntent` 直接 `return void 0` |
| 65 | `HOOKS_PRESTEP_REJECT_NEUTRAL` | replace 会把 `if (merged.decision === "deny")` 文本**写回去**，而 #30/#31 的锚点正是这句话。于是第一次应用后文本回退、第二次应用才被 #30 重新吃掉 → 「应用一次」与「应用两次」产物不同，不幂等。 | replace 直接输出 `__dsh_purge_deny_disabled__` 形态，不再写回 `"deny"`；同时保留两条 marker 注释，保证 #65 自身仍判 `applied` |

### 7.2 本轮实测结果

基准：npm `0.2.2-rc.3` 原始产物（干净未打补丁）。

| 检查 | 结果 |
|---|---|
| `applyPatches(ALL_PATCHES)` 一次 | applied **65** / skipped **6** / missing_file **1** / na **10** |
| 被改写文件 | 49 个；全部 `node --check` 通过，**0 语法错误** |
| 幂等性 | apply 1 次 与 apply 3 次 产物**逐字节一致**（0 差异） |
| `#17` 语义 | `writeIntent` / `editIntent` 均为无条件 `return void 0` |
| `#30` `#31` `#65` | 均为 `applied`，不再需要第二轮收敛 |

### 7.3 剩余 6 条 `skipped`：无目标可改，不是适配缺陷

| # | 名称 | 原因 |
|---|---|---|
| 32 | `WEB_SURFACE_IDENTITY_NEUTRAL` | rc.3 已整段删除 `You are interacting with the user through the DeepSeek Harness Web GUI at ${webUrl}.`；对 51 个包全量搜索，该句与 `Canonical local URL` 均无匹配 —— 没有文本可替换 |
| 53 | `WEB_SURFACE_PROHIBITION` | 同上，属同一段 web surface 文案 |
| 40 | `COMPLETE_PROMPT_KEEP_INJECT` | 0.1.5 兼容条目；2.x 的 `system-prompt` 已无该段 waterfall 形态 |
| 56 | `REWIND_HIDE_CUT_ONLY` | 前端 bundle 重新压缩发布，`rewind-*` 标记不再出现；`optional`，只影响回退后的列表润色 |
| 77 | `REWIND_DROP_SENT_ON_APPEND` | 同上 |
| 80 | `MINIMAL_OFFICIAL_TOOLSET` | 各版本（含 0.2.0-rc.2）常态 `skipped` |

`missing_file` 仍为 `#71`，依赖第三方 `@linxin666/dsh-liangshen` 预设，干净安装下本就没有。

### 7.4 复现本次实测

```sh
# 1) 取 rc.3 原始产物（51 个包）
npm pack @deepseek-ai/dsh-agent-instructions@0.2.2-rc.3   # 其余包同理
# 2) 解出 package/ 内容，铺成 <fixture>/dsh-<pkg>/{lib,cordis.patch.yml,...}
# 3) 指向该 fixture 跑
node -e "import('./lib/core.js').then(async m=>{const s=await m.patchStatus('<fixture>',m.ALL_PATCHES);console.log(s)})"
# 4) 幂等回归：对两份副本分别 apply 1 次 / 3 次，逐字节比对
```

> 说明：上述验证只覆盖 npm 发行包。桌面版 `app.asar` 内联布局、客户端槽位加载、重启后重复注册等运行时行为，需要在真实安装上另行确认。

---

## 8. 第四轮（1.1.75）：`{{cwd}}` 变量缺失与静默丢工具

前几轮只校准「补丁锚点」，没有覆盖插件**自身运行期**与 rc.3 的接口变化。这一轮修的是两个运行期缺陷，它们与补丁表无关，装到 rc.3 上会直接让会话不可用。

### 8.1 第一层：`{{cwd}}` 不再由宿主注册

rc.3 把工作目录从「提示词变量」改成独立服务 `@deepseek-ai/dsh-working-directory`。核对结果：

| 检查 | 结果 |
|---|---|
| 在 rc.3 全部 51 个包内搜索 `variable("cwd"` | **0 处** |
| `dsh-system-prompt` 对未注册变量的处理 | **抛错**，见 `interpolate()` |
| `dsh-working-directory` 暴露的读取方式 | `service.get(session)` |

`dsh-system-prompt` 的严格插值：

```
unknown prompt variable "{{cwd}}" in section "..."; registered variables: ...
```

而本插件会把 `{{cwd}}` 写进提示词：`cordis.patch.yml` 的 `personaSuffix`、`core.js` / `identity.js` 的内置段落。于是**每次组装提示词都会抛异常**。

`<= 0.2.0` 的宿主自己注册 `cwd`，所以这一条只在 rc.3 上暴露。

**修法**（新增 `lib/working-directory-compat.js`）：

- 用官方无 inject 读取服务的写法 `ctx.reflect.get("workingDirectory")`（同 `dsh-experimental-liveshare` 的 `ctx.reflect.get("launchEnvironment")`），服务不存在时返回 `undefined`，不抛。
- 取值顺序：`service.get(session)` → `session.header.cwd` → `service.defaultDirectory` → `process.cwd()`。
- **变量提供者永不抛错、永远返回字符串**：它运行在 `system-prompt/assemble` 管线里，抛一次就等于整轮组装失败。
- 注册失败一律吞掉：旧版宿主已注册 `cwd` 时重复注册会抛 `prompt variable "cwd" is already registered`，此时保留宿主自己的提供者。

### 8.2 第二层：组装失败被静默改写成「空工具列表」

`lib/identity.js` 的 `assembleGuard` 原本这样兜底：

```js
catch (err) { console.warn(...); return { sections: [], contexts: [], tools: [] }; }
```

原生 `assemble` 一抛（例如上面那条 `{{cwd}}`），这里就伪造一个空 assembly：**工具定义全部消失**。模型手里没有任何可调用的工具 schema，于是把工具调用写成了正文，出现 `DSML|invoke` 之类的文本——看起来像「模型不会调工具」，实际是兜底把 schema 抹掉了。整个链路里没有任何一处报错，只有一条 `console.warn`。

**修法**：兜底改为 `throw err`。组装失败就显式失败，不再伪造空装配。

### 8.3 第三层：DSML 正文兜底（新增 `lib/native-tool-compat.js`）

即使上面两条都修好，个别供给方仍会把工具调用写成正文（实测：`opencode-go` 提供 `deepseek-v4.1-flash`）。本模块**不解析正文、绝不把文本改写成可执行调用**，只做两件事：

1. **清理重放状态**：丢掉历史里泄漏的 DSML 正文块与旧轮次 `reasoning`，避免坏轮次污染后续请求；同时移除对应 `source.replayState`。
2. **重发一次**：检测到泄漏时附上「请走原生 tool_calls 通道」的声明重试一次；二次仍泄漏则返回 `DSH_TOOL_FORMAT`，不再无限重试。

生效条件很窄：`provider === "opencode-go"` 且模型名匹配 `deepseek-v4.1-flash` 且本轮带工具。其余流量原样透传（见测试用例）。`DSH_TOOL_FORMAT` 同时加入 `continue-retry` 的 `PERMANENT_CODES`，避免自动「继续」反复烧 token。

> 代价：命中条件的请求会在本次回复结束、校验通过后才下发首段输出，首字有延迟。这是「先校验再显示」换来的确定性。

### 8.4 本轮验证

模块级行为测试（21 项，`node` 直接跑，不依赖宿主）：

| 分组 | 覆盖 |
|---|---|
| `readWorkingDirectory` | rc.3 服务优先 / 旧宿主无服务回退 header / `service.get` 抛错回退 / 空串回退 / 无 session 用 `defaultDirectory` / 全空仍返回字符串 / `reflect.get` 本身抛错不溢出 / `context.session` 形态 |
| `installWorkingDirectoryVariable` | rc.3 正常注册 / 宿主已注册时吞掉异常 / 无 `systemPrompt` 返回 noop / 敌意 ctx 下提供者仍返回字符串 |
| `isToolLeak` | 识别 `DSML\|invoke`、`function_calls` / 忽略代码块示例 / 忽略普通散文 |
| `sanitizeReplay` | 丢弃泄漏正文与 `replayState` / 健康轮次不改写 |
| `nativeToolGuard` | 非目标 provider 原样透传（不触碰 `this.stream`）/ 缺 `this.stream` 时回退 `next()` / 重复安装幂等 |

集成检查：

| 检查 | 结果 |
|---|---|
| 5 个改动文件 `node --check` | 全部通过 |
| `import("./lib/index.js")` | 成功，`inject` 仍为 `["systemPrompt","tools"]`（未新增必需依赖，不破坏 0.2.0 装载） |
| rc.3 补丁回归 | applied 65 / skipped 6 / missing_file 1 / na 10，改写 49 个文件，**0 语法错误**，与 7.2 节一致，无回归 |

### 8.5 已知边界

- 未在真实桌面客户端里跑端到端会话；上述结论来自模块级测试 + rc.3 发行包静态核对。
- `workingDirectory` 服务在 rc.3 上以 `ctx.reflect.get` 严格模式读取；若某版本服务已注册但 fiber 未激活，会回退到 `session.header.cwd`（即会话原始目录，不含后续 `cd`）。
- DSML 守卫按 provider 名硬匹配 `opencode-go`。换供给方需要同步改 `eligible()`。

---

## 9. 第五轮（1.1.76）：适配 dsh `0.2.2-rc.5`（补丁锚点 + 运行期 + 演练台预设）

全量比对 npm `0.2.2-rc.3` → `0.2.2-rc.5` 全部 332 个 `@deepseek-ai/dsh*` 包及 `docs/upgrade-guide`（含 `@earendil-works/pi-ai@1.6.0`），发现 rc.3 → rc.5 有 14 个包改动（核心变化：`dsh-llm` / `dsh-llm-deepseek` 新增 `CONTENT_REFUSED` 错误码、`dsh-base` / `dsh-web` / `dsh-tool-web` 将 DeepSeek 模型默认搜索切换为按路由自动选择），同时补齐了前几轮未覆盖的 0.2.1–0.2.2 运行期与锚点缺口。

### 9.1 修复项

| 模块 / 条目 | 问题 | 处理 |
|---|---|---|
| `presets/redteam/agent.cordis.yml` & `lib/redteam/index.js` | `0.2.1+` 删除了 `@deepseek-ai/dsh-tool-subagent-control/list-agents` 子路径导出，且 `dsh-tool-subagent` 遇到 `toolFilter` 会直接抛错、移除了 `backgroundMode`、将 `modelSelectionSettings` 改为 `modelSelection` + `modelDiscovery`，导致红队预设在 `0.2.2` 上挂载失败（`broken`） | 移除 `tool-subagent-list-agents`、`toolFilter`、`backgroundMode` 与已下线的 `workflow-worker-thread` 行，迁移为 `modelSelection: true` + `modelDiscovery: true`（保留 `maxDepth: 1` 叶子约束）；`repairDelegation()` 增加就地自愈，平滑修复已有用户预设并保留自定义人设 |
| `lib/redteam/tools.js` & `lib/redteam/ui.js` | `0.2.1-rc.2` 删除了 `ctx.subagents.listChildren()`，导致 `redteam_agent_slot` 并发闸门与面板运行态统计在 `0.2.2` 上不可用 | 兼容回退到 `ctx.subagents.listDescendants()`（旧版宿主保留 `listChildren()` 优先），兼容 `name` 字段展示 |
| `lib/continue-retry.js` | `0.2.2-rc.4/rc.5` 将 DeepSeek 流式 `stop_reason: "refusal"` 错误码从 `MALFORMED_RESPONSE` 改为 `CONTENT_REFUSED`（非重试类），原 `PERMANENT_CODES` 未覆盖，导致无意义重试 | 将 `CONTENT_REFUSED` 及 `0.2.2` 确定性不可重试码（`ACCOUNT_SIGN_IN_REQUIRED`、`ACCOUNT_TOKEN_INVALID`、`CLIENT_UPGRADE_REQUIRED`、`MODEL_UNSUPPORTED`、`UNKNOWN_MODEL`、`UNSUPPORTED_CONTENT`、`UNSUPPORTED_OPTION`、`UNSUPPORTED_REASONING_EFFORT`、`TOOL_ACTIVATION_FAILED`）加入 `PERMANENT_CODES` |
| `#32` `WEB_SURFACE_IDENTITY_NEUTRAL` | `0.2.2` `dsh-web-app` 将环境变量描述改为 `Advertised URL of the DeepSeek Harness Web GUI serving this session.` | 追加 0.2.2 锚点，`#32`（及关联 `#53`）从 `skipped` 恢复为 `applied` |
| `#56` `REWIND_HIDE_CUT_ONLY` & `#77` `REWIND_DROP_SENT_ON_APPEND` | `0.2.2` `dsh-client-ui-conversation/lib/client.js` 为压缩产物，但 `ConversationNodeAssembler`、`replaceWindow`、`append` 符号未混淆且各唯一出现 1 次 | 追加压缩形态锚点（使用块注释确保单行语法安全，并为 `isRewindMarker` 加 `typeof` 守卫），两条均恢复 `applied` |
| `#57` `DEEPSEEK_SYSTEM_ROLE` | `dsh-llm-pi-ai@0.2.2-rc.5` 依赖的 `@earendil-works/pi-ai@^1.3.0`（实测 `1.6.0`）将 `openai-responses-shared.js` 的 `const role` 重命名为 `const instructionRole` | 追加 `instructionRole` 锚点，使 Responses 通路在 `pi-ai 1.6+` 上同样生效 |

### 9.2 本轮实测结果

| 检查 | 结果 |
|---|---|
| 实机 Windows 桌面端 `0.2.2-rc.5` 解包与 `reapplyInstalled` | applied **73** / pending **0** / failed **0**（含 `#40`、`#32`、`#56`、`#77`、`#57`）；49 个补丁目标 JS `node --check` 全过，真实 `0.2.2-rc.5` 宿主启动 E2E 全通（`/dsh-purge/status`、`/redteam/api`、红队预设 `registered / broken: null`）；同时修复 `lib/reapply.js` 首次解包后二次重复解包 `app.asar` |
| 语法与幂等（`0.2.2-rc.5`） | 改写 54 个文件，全部 `node --check` 通过（**0 语法错误**）；apply 1 次与 3 次逐字节一致（**0 差异**） |
| 向下兼容（`0.2.2-rc.3` 51 包基线） | applied **69**（较 v1.1.75 的 65 新增 `#32` `#53` `#56` `#77`）/ skipped **2**（`#40` `#80`），**0 回归**、**0 语法错误** |
| 压缩版回退逻辑功能测试 | 从补丁后的 `dsh-client-ui-conversation/lib/client.js` 抽出 `isRewindMarker` / `rewindVisibleEntries` 实测：准确隐藏被回退轮次与标记、保留前序轮次与系统消息 |
| 红队预设与自愈回归 | 随包 `presets/redteam/agent.cordis.yml` 与就地修复后的旧版用户预设均通过 `readPresetDefinition()` 校验、保留自定义人设且二次运行幂等；`redteam_agent_slot` / `ui` 在 `listDescendants` 与 `listChildren` 两种宿主形态下均通过 |
| 既有兼容测试（`_compat-test.mjs`） | 21 项全通过；`continue-retry` 新错误码测试全通过 |
