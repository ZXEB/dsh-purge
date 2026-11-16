# 适配记录：1.1.71 → 1.1.73（dsh 0.2.2-rc.3）

本文件记录适配**改了什么、为什么改、怎么验证的**。只涉及文本锚点与文件键，没有改动补丁的语义目标。

---

## 1. 适配基准

| 项 | 值 |
|---|---|
| 上游插件 | `ZXEB/dsh-purge` v1.1.71（master `719a741`） |
| 原 `dshTarget` | `0.2.0-rc.2` |
| 新 `dshTarget` | **`0.2.2-rc.3`**（npm `next` 通道最新版） |
| 已验证版本 | `0.2.2-rc.3`、`0.2.2-rc.2`、`0.2.2-rc.1`、`0.2.1-rc.3`、`0.2.0-rc.2` |

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
