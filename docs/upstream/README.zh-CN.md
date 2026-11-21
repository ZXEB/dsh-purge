# 上游归档说明（dsh-purge）

本文件为上游 `dsh-purge` 仓库说明的归档占位文档。当前维护版本的完整中文说明、安装步骤、配置项与兼容性说明请直接查看根目录的 [README.md](../../README.md)。

## 项目定位

`dsh-purge` 是面向本机已安装官方 [DeepSeek Harness](https://www.deepseek.com/harness/) 的本地运行时适配与提示词管理插件，支持官方 **Web（`dsh web`）** 与官方**桌面客户端**：

- 以可回滚补丁表的形式统一本机宿主默认配置与提示词段落；
- 提供侧栏面板用于查看状态、应用/还原/卸载、编辑本地提示词与多套规则集（`AGENTS.md` / `CLAUDE.md`）；
- 仅操作使用者本机已安装的 `@deepseek-ai/*` 包产物与本地 `$DSH_HOME` 配置目录，不修改 Harness 源码仓库。

## 署名与许可

- 原始上游仓库：`YuJunZhiXue/dsh-purge`（作者：小杨）
- 当前适配仓库：`ZXEB/dsh-purge`
- 开源许可：MIT（详见根目录 [LICENSE](../../LICENSE)）
