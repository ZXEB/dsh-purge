# DSH Local Test 0.1.0

面向 **DeepSeek Harness 桌面版 0.2.2-rc.3** 的独立诊断插件。安装后在 **设置 → 本地测试** 使用。

本目录是新增的独立包。仓库原有的 `dsh-purge` 文件与历史功能原样保留；安装本包只启用本目录的功能，不会自动加载原插件。

## 功能

- 显示实际 DSH 运行时版本、适配版本、Node.js 版本与系统架构。读不到运行时版本时明确显示“未知”。
- 使用官方 Typert Remote 接口，兼容桌面 IPC，无需固定 localhost 端口。
- 手动检查单个 HTTP / HTTPS 网站，显示状态码、是否重定向和请求耗时。
- 每次点击只发送一个 GET 请求，默认 5 秒超时；取消检查或卸载插件会中止请求。
- 结果区分网络不可达与 HTTP 错误。仅接收响应头并取消响应正文，不跟随重定向。

检查由 DSH Host 发起，使用它的网络环境，不能代表浏览器 CORS 或页面脚本可用性。GET 请求仍可能触发网站行为，请选择有权测试的地址。URL 查询参数会随请求发送，结果展示省略查询参数；结果只保存在当前页面内存中。

本插件不修改系统提示词、权限审批、沙箱、安全钩子或其他插件配置。

## 构建和安装

需要 Node.js 24 与 pnpm。命令在本目录运行：

```powershell
pnpm install --frozen-lockfile
pnpm run build
pnpm test
pnpm pack --pack-destination dist
dsh plugin --profile desktop add ./dist/dsh-local-test-0.1.0.tgz
```

如果终端没有 `dsh`，Windows 默认桌面安装路径中的包装器为：

```powershell
& "$env:LOCALAPPDATA\Programs\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd" plugin --profile desktop add ./dist/dsh-local-test-0.1.0.tgz
```

安装后保存当前任务并重新打开 DSH。插件通过 `engines.dsh` 声明准确适配版本，不为未验证版本授予兼容性豁免。

卸载独立包：

```powershell
dsh plugin --profile desktop remove dsh-local-test
```

## 验证

`pnpm test` 使用本地 HTTP 服务验证状态码、重定向、超时、取消、URL 校验和资源回收，并检查 Remote 元数据、Host / Client 注册与清理。测试不访问外部网站。

宿主入口由 `src/index.ts` 构建，客户端由 `src/client.jsx` 构建；`src/remote.js` 是双方共享的严格协议定义，`src/typert.js` 提供官方 loader 识别的 Host 元数据。
