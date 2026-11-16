# DeepSeek Harness 0.2.2-rc.3 桌面版兼容性检查

检查日期：2026-11-15（Asia/Shanghai）。

检查对象：`dsh-purge` 1.1.71，仓库提交 `719a741ddda2b888920a1586dea9eb396af3ea1b`。

**结论：尚未验证该插件兼容桌面版 0.2.2-rc.3。** 当前完成了版本核对、发行包只读检查与 JavaScript 语法检查，未在客户端中安装、加载或应用插件。本文是检查报告，不是适配完成或功能可用的声明。

本次仅新增本文；原有源码、入口、配置、README、许可证与历史功能均保留。未修改本机 DSH 安装、用户 profile 或安全设置。

## 1. 版本基准

| 项目 | 核实结果 | 证据 |
| --- | --- | --- |
| 本机 Windows 桌面版 | `0.2.2-rc.3` | Windows 卸载登记与桌面运行时清单一致 |
| 官方 Windows x64 nightly 更新源 | `0.2.2-rc.3` | 检查当日读取 `nightly.yml` |
| 该更新源的发布时间 | `2026-11-13T07:31:42.937Z`，即北京时间 2026-11-13 15:31 | 更新源 `releaseDate` |
| npm `@deepseek-ai/dsh` 的 `latest` 标签 | `0.2.2-rc.1` | npm 注册表 `dist-tags.latest` |
| npm `@deepseek-ai/dsh` 的 `next` 标签 | `0.2.2-rc.3` | npm 注册表 `dist-tags.next` |
| 当前插件 | `1.1.71`，`dshTarget: 0.2.0-rc.2` | 仓库 `package.json` |

这里的“最新桌面版”仅指此次核实的 Windows x64 nightly 渠道。npm 的 `latest`、`next` 标签和桌面更新渠道应分别核对，不能把某一个标签当成所有客户端的统一版本。

## 2. 已确认的兼容性差异

### 2.1 客户端依赖清单存在差异

对照插件 `package.json` 的 `dsh.client.inject` 与本机官方 `app.asar` 中的包清单，结果如下：

| 插件声明的客户端包 | 桌面发行包中的同名包 |
| --- | --- |
| `@deepseek-ai/dsh-client-connection` | 存在，`0.2.2-rc.3` |
| `@deepseek-ai/dsh-client-runtime` | 未发现 |
| `@deepseek-ai/dsh-client-locale` | 存在，`0.2.2-rc.3` |
| `@deepseek-ai/dsh-client-ui-slots` | 未发现 |
| `@deepseek-ai/dsh-client-ui-settings` | 存在，`0.2.2-rc.3` |

“未发现”仅表示该桌面归档中没有对应的同名 npm 包，不能据此断言运行时一定缺少同名服务，或断言所有环境必然加载失败。仍需通过官方加载机制验证模块解析、服务注入和界面槽位；本次没有执行这些运行测试，也没有替换依赖。

### 2.2 `dshTarget` 不能证明新版准入或运行兼容

本机官方 `@deepseek-ai/dsh-app-boot` 的兼容性检查读取规则为：

1. 插件声明 `engines.dsh` 时，以该范围检查当前 DSH 运行时版本。
2. 否则检查 `peerDependencies` 中的 `@deepseek-ai/dsh` 与 `@deepseek-ai/dsh-*` 版本要求。
3. 两者均未声明时，该检查不会对 DSH 版本施加约束。

当前插件只有 `engines.node`、Cordis peer 和顶层 `dshTarget`。在此次读取的官方版本检查逻辑中，`dshTarget` 不参与上述判定。因此，“安装器没有报版本不匹配”与“已验证支持 0.2.2-rc.3”是两件不同的事。仅修改 `dshTarget`、徽章或说明文字也不能构成适配验证。

### 2.3 Cordis 版本范围本身没有明显冲突

插件声明 `@deepseek-ai/cordis: ^4.0.1`；本机桌面发行包携带 `4.1.0`，处于该 SemVer 范围内。

这只能说明声明的版本范围能够覆盖，不能证明服务名称、生命周期、槽位或其他 API 行为全部兼容。本次没有调用插件的 `apply()`。

### 2.4 桌面安装布局需要单独验证

本机桌面发行包同时包含 `app.asar`、`resources/runtime/cli` 与独立的 `resources/runtime/primary-runtime`。官方桌面 CLI 入口通过 Electron 启动归档内的宿主 CLI。

桌面运行时清单记录的 Node 为 `24.21.0`，pnpm 为 `11.28.5`。这些是发行包清单声明值，本次没有启动 DSH CLI 核实执行时实际选择的版本。仓库声明的 Node 最低版本 `>=18` 也尚未通过多版本运行测试验证。

不能根据旧版桌面或普通 Web profile 的文件布局，直接推定新版桌面的加载路径和生命周期相同。本次未执行宿主补丁、解包写入、启动器改写或 profile 安装。

## 3. 已执行的检查

JavaScript 语法检查使用 Codex 工作环境的 Node `v24.22.1`，与上文 DSH 发行包声明的 Node 版本分别记录。

| 检查 | 结果 |
| --- | --- |
| 读取仓库 `package.json` | 成功，JSON 可解析 |
| `node --check lib/index.js` | 通过，退出码 0 |
| `node --check lib/core.js` | 通过，退出码 0 |
| `node --check bin/dsh-purge.js` | 通过，退出码 0 |
| `node --check client.js` | 通过，退出码 0 |
| 只读检查官方桌面归档中的版本与依赖清单 | 完成 |
| 读取官方更新源与 npm dist-tags | 完成 |

`node --check` 只检查语法，不解析完整依赖图，不执行入口，也不验证界面、插件加载或功能行为。

## 4. 尚未验证的项目

| 项目 | 状态 |
| --- | --- |
| 通过官方插件管理器安装与卸载 | 未执行 |
| 桌面宿主加载及缺失依赖的实际解析结果 | 未执行 |
| 侧栏、语言资源和客户端槽位显示 | 未执行 |
| 重启或热重载后的重复注册与资源清理 | 未执行 |
| 原有规则、Skill、回退等功能 | 未执行 |
| 原有提示词替换、宿主补丁和权限修改功能 | 未执行；本次不作可用性声明 |
| 其他 DSH 版本、macOS、Linux 和 Web 客户端 | 未检查 |

因此，本报告不建议把兼容性表更新为“已支持 0.2.2-rc.3”，也不更改插件版本或触发新版发布。

## 5. 文档表述建议

对外说明可以采用中性的“本地测试插件”“兼容性检查”“授权测试”等表述，并明确区分历史功能、声明支持和实际验证结果。涉及提示词替换、宿主补丁或权限修改的能力仍需如实说明，不能仅通过改名让读者误以为这些行为不存在。

此次仅提交检查报告，未改写或删减原 README，也未变更原始署名与许可。

## 6. 证据来源

公开来源：

- 官方 Windows x64 nightly 更新清单：`https://download.deepseek.com/dsh-desk/feeds/win-x64/nightly.yml`
- 官方 CLI npm 元数据：`https://registry.npmjs.org/@deepseek-ai%2fdsh`

本机官方发行包中的只读证据，以下路径均相对于桌面安装目录或 `app.asar`：

- `resources/runtime/primary-runtime/runtime.json`
- `resources/runtime/versions.json`
- `resources/runtime/cli/bin/dsh.cmd`
- `dsh/node_modules/@deepseek-ai/dsh-desktop-host/package.json`
- `dsh/node_modules/@deepseek-ai/cordis/package.json`
- `dsh/node_modules/@deepseek-ai/dsh-app-boot/lib/index.js` 的版本兼容性检查
- `dsh/node_modules/@deepseek-ai/dsh-app-boot/README.zh.md` 的 profile 版本检查说明
- `dsh/node_modules/@deepseek-ai/dsh-plugin-manager/README.zh.md` 的版本兼容性说明

归档中读取了包清单与相关代码片段，没有将官方程序文件重新打包或提交到本仓库。报告也不包含本机账号、凭据或用户配置内容。
