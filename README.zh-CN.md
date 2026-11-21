<p align="center">
  <img src="docs/banner.svg" alt="dsh-purge" width="720">
</p>

<h1 align="center">dsh-purge（中文文档索引）</h1>

> 完整中文文档见 **[README.md](README.md)**，英文文档见 **[README.en.md](README.en.md)**。
>
> 本文件仅为兼容旧链接与插件自更新时的文件清单而保留。

- 环境要求：dsh **0.2.2-rc.5**（0.2.0 / 0.2.1 / 0.2.2-rc.1~rc.4 可用）、Node ≥ 18
- 安装方式：本地目录（推荐，离线可用）、手动改 profile、`install.ps1` 一键脚本
- 安装后三步：完全退出宿主 → 适配 → 应用 → 自动重启 → 新开会话
- 其它：安装验证清单、目录结构、运行时文件、配置项、CLI 与聊天命令、更新/还原/卸载、FAQ、兼容性表
- 适配记录：[ADAPTATION-NOTES.md](ADAPTATION-NOTES.md)

```powershell
# 最短路径：装到桌面宿主（把路径换成实际目录）
dsh plugin --profile desktop add D:\path\to\dsh-purge-0.2.2
```
