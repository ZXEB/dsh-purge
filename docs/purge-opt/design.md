# purge-opt · armor-kit 增强层

放在 `armor-kit/purge-opt/` 下，由 `install.sh` 与 `patch/apply.mjs` 一起铺到社区版 `lib/`。

**前置条件：必须先有社区版 `dsh-purge-community`。** 没有社区版时本包的 12 个模块
不会被任何东西调用，等于没装——`install.sh` 第 [1/6] 步会自动装社区版，装不上就直接 die。
上游 `dsh-purge@1.1.71` 不能替代：本包挂的是社区版的钩子名与段名（`dsh-purge-boost`、
`dsh-purge-ladder`、`agent/pre-step`、`system-prompt/assemble`、`llm/stream`）。

---

## 1. 两版差异（实测）

| 维度 | 上游 1.1.71（20637 行） | 本机 1.6.93（24775 行） | 结论 |
| --- | --- | --- | --- |
| 组装入口 | `core.js` 7984 行 + `index.js` 2596 行 | `core.js` 4624 行，拆成 90 个模块 | 本机已模块化，**补丁应按模块切，不要往 core 里塞** |
| 宿主补丁表 | `rules.js`（560 行，与上游逐字相同） | 同 | 一致，无需移植 |
| 网络门控 | `net-scope.js` 673 行，含 `installRegionGate` / `isAttackTask` / `taskTargetHit` / `parkDenial` | 412 行，**整段被删**，只剩 allow-list 读写 | 上游能拦"攻击任务"，本机不拦；这是有意的产品取舍 |
| asar 解包 | 462 行 | 504 行，多了路径边界、链接拒绝、安全名检查、`closeSync` 泄漏修复、`noDeprecation` 只读保护 | 本机更强 |
| 桌面身份识别 | 按 exe 名 + 正则认官方 Harness | 改为 `hasDesktopIdentity(resourcesDir)` 布局证据 | 本机更强（不再靠文件名） |
| 装配接管 | `identity.js:installAssembleGuard` + `rewritePromptAssembly` | `assemble.js`（158 行） | 本机有，但改写规则偏粗 |
| 身份段清洗 | 600 字窗口正则 | 8 字阈值判"纯身份" | 两边都会误删"有实质内容"的身份段 |
| 拒绝处理 | **无**（只有 core 里的提示词约束） | `refusal-retry.js` + `reinforce.js` + `ladder.js` + boost | 本机独有，但实现有 5 处结构性缺陷（见下） |
| 探针 | 无 | `probe.js`（要求模型回显 nonce） | 会污染回复 |
| 状态写 | 原子写 `atomicWriteSync` | `fs.writeFileSync` 直接覆盖（ladder/boost/tuning） | 上游这里更稳 |
| 红队资产 | `presets/redteam`、`skills/redteam`、`docs/`（3.6 MB） | 保留并扩展（role-section、evidence-ledger、atomic-write） | 本机更强 |
| 更新链 | `update.js` 1120 行 | 1427 行 + 11 个 update-* 模块 | 本机更强 |

**一句话结论**：本机在"工程健壮性"上明显领先上游，但在**装配改写的精度、拒绝判定的准确率、
状态写入的原子性、每轮锁的成本控制**这四块落后于它自己的设计意图。补丁就补这四块，
外加把上游有而本机没有的两样东西（原子写、网络攻击任务门控）以可选模块形态带回来。

---

## 2. 本机实测到的 8 个具体问题

1. **误判把正常回答当拒绝**
   `refusalPatterns` 只看首 600 字。长回答里出现"我无法验证这个假设"就会命中，
   整段输出被丢弃重跑——用户看到的是"回答到一半从头再来"。

2. **漏判软拒绝**
   模型先写客套（"这个问题很有意思"），软拒绝在第 900 字才出现，前 600 字里一个字都没有。

3. **重试只重试一次**
   `streamWithRefusalRetry` 固定 `bufferChars=400`、只重跑一次；第二次仍拒就把拒绝原样吐给用户。
   等于"重试只是表演"。

4. **nudge 只写回 `messages[0]`**
   装配后 system 段不一定在 `[0]`（boost/ladder 会被压到头部），写错位置 = nudge 没进上下文。

5. **拒绝时没升档**
   阶梯只在 `onRetry` 里 `bumpLadder`，但升档后的文本靠下一次请求的 section 生效，
   重试那一次拿不到新档位文本（除非外部手动拼）。

6. **每轮都落锁，token 无上限**
   `reinforce.js` 只要题面命中形态敏感词就落锁，长会话里锁的累计消耗没有上限。

7. **状态文件非原子写**
   `ladder.js` / `boost.js` / `tuning.js` 都是 `writeFileSync` 直接覆盖；
   断电或 kill 留下半截 JSON，下次启动读崩，用户只能重装或手删。

8. **探针污染回复**
   探针要求模型"原样回显 nonce"，用户会看到一行莫名其妙的 `[purge-xxxx]`。

---

## 3. 补丁清单

| 文件 | 解决 | 关键设计 |
| --- | --- | --- |
| `lib/runtime-state.js` | 7 | 临时文件 → `fsync` → `rename` 原子写；坏 JSON 改名 `.corrupt-<ts>` 而不是删除 |
| `lib/opt-signal.js` | 1、2 | 三向量打分：句首位置、拒绝词密度、实质产物（代码块/编号步骤/命令）。产物越多越降权；"讨论越狱"本身有元豁免 |
| `lib/opt-retry.js` | 3、4、5 | 句末即判（首字延迟不增加）；硬拒绝 ≥0.85 直接升档、软拒绝只换话术；重试上限可配；nudge 写入**所有** system 段，没有就插一条 |
| `lib/opt-form.js` | 形态劫持 | 11 类交付形态；命中时生成 ≤3 行形态锁，指明"必须给到什么产物" |
| `lib/opt-lock.js` | 6 | 只在「该出事」时落锁：催重试 / 上一条带拒绝痕迹 / 档位非 L0 / 形态敏感题面。重复落锁就地改写而不是追加 |
| `lib/opt-assemble.js` | 身份段误删、重复段 | 摘 `complete`、抠身份句但保留后句（≥24 字实质内容就不删）、同名段去重、自己的段压两头 |
| `lib/opt-ladder.js` | 5、7 | 阶梯状态原子写 + **自动落档**：连续 4 轮干净交付落一档，避免长会话挂在 L3 白烧 token |
| `lib/opt-probe.js` | 8 | 默认静默探针（"不要提、不要回显"），需要确认时才切显式 |
| `lib/opt-budget.js` | 6、7 | 锁 token 预算：full → form-only → on-demand-only 三级降级；启动自愈（重建目录、补齐状态、坏文件隔离） |
| `lib/opt.js` | 门面 | `installOpt(ctx)`：一层挂不上只降级该层，全部失败也不阻塞插件加载；审计记录装了哪几层 |
| `lib/opt-companion.js` | 挂载 | 独立 Cordis 插件模块，宿主按 patch 里的位置注册，与主插件共用 ctx |
| `scripts/install.mjs` | 安装 | 复制文件 + 补 `package.json exports` + 在 `cordis.patch.yml` 插一段托管块；幂等，`--uninstall` 精确回滚 |
| `scripts/selftest.mjs` | 验证 | 69 条断言：判定矩阵、形态分类、落锁决策、装配改写、阶梯状态机、原子写、探针、预算、自愈 |
| `scripts/smoke-host.mjs` | 验证 | 17 条断言：模拟宿主事件总线跑真实钩子契约（含 reject 透传、上游异常上抛、双签名 assemble、早停重试、幂等） |

---

## 4. 安装

```bash
# 0) 找到目标
node scripts/install.mjs --discover
#   → dsh-purge-community@1.6.93  /root/.dsh/profiles/web/node_modules/dsh-purge-community

# 1) 预演（只看会改什么）
node scripts/install.mjs --target ~/.dsh/profiles/web/node_modules/dsh-purge-community --dry-run

# 2) 安装
node scripts/install.mjs --target ~/.dsh/profiles/web/node_modules/dsh-purge-community

# 3) 完全退出 DSH → 重新打开 → Purge → 状态 → 点『应用』→ 新开会话
```

卸载：

```bash
node scripts/install.mjs --target <同一目录> --uninstall
```

### 配置

`$DSH_HOME/dsh-purge/opt.json`（不存在就用默认值，全开）：

```json
{
  "enabled": true,
  "retry": true,
  "maxRetries": 2,
  "form": true,
  "assemble": true,
  "section": true,
  "sectionOrder": 10500,
  "decayAfter": 4
}
```

阶梯档位在 `$DSH_HOME/dsh-purge/ladder.json`（与原插件同一个文件格式，字段多了 `decays`）。
急救暗号 `寒霜 / 破甲 / 醒来 / 又拒绝了` 升一档；复位词 `回到直给 / 解除阶梯 / 回 L0` 回 L0。

---

## 5. 与原实现的兼容

- **不改上游任何文件**：`rules.js`、`core.js`、`index.js` 一行没动。
- **不改原状态文件格式**：`ladder.json` 只多一个可选字段，原插件读不懂也不会崩。
- **`cordis.patch.yml`** 只追加一个托管块（`# >>> dsh-purge-opt companion begin`），
  卸载时按标记精确删除，不会伤到原插件自己的 insert 行。
- **插件升级**：npm 只铺 `files` 白名单里的文件，我们的 11 个模块会消失 →
  **升级后重跑一次 `install.mjs`**（幂等）。这是这套方案的已知代价；
  想彻底免维护，就把这些模块并进上游仓库（见 §6 建议）。
- **钩子顺序**：companion 插在原插件之后，所以原插件的 pre-step / assemble 先注册，
  本层的装配改写能看到它的产出；`prepend: true` + `global: true` 让本层在最外层收口。

---

## 6. 建议回流到上游的 3 处（按价值排序）

1. **`atomicWriteSync` 统一状态写**（上游 1.1.71 已有实现，本机反而丢了这个特性）
   —— 直接拿上游 `core.js:48-76` 的版本，替换 `ladder.js` / `boost.js` / `tuning.js` 的写入。
2. **拒绝判定改打分制**（本包 `opt-signal.js` 可整文件搬）
   —— 现在的正则表在长回答里误判率太高，误判的代价是整段重跑。
3. **装配改写的实质内容阈值**（本包 `opt-assemble.js` 的 `SUBSTANCE_MIN`）
   —— 8 字阈值会删掉 "You are a helpful software engineer assistant. Always run tests." 这样的有效约束。

---

## 7. 已知限制

- `llm/stream` 若被宿主声明为**同步** waterfall，async generator 不会被消费；
  此时需在 `opt.json` 里关 `retry`（其它层不受影响）。`opt-retry.js` 已留 `asyncHost: false` 出口。
- 段落注册走 `ctx.prompt.addSection` / `ctx.systemPrompt.addSection` 三个候选 API；
  都不可用时 `section` 层自动降级，档位与形态锁仍通过 pre-step 锁生效。
- `sectionOrder` 默认 10500（排在 boost 之后）。若宿主 persona-suffix 的 order 与之冲突，
  改 `opt.json` 的 `sectionOrder`，不要改代码。
