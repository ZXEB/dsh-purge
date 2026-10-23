<p align="center">
  <img src="docs/banner.svg" alt="dsh-purge" width="720">
</p>

<h1 align="center">⚔️ dsh-purge（中文文档）</h1>

> **中文完整文档已合并到 [`README.md`](README.md)。** 本文件保留仅为兼容旧链接与插件自更新时复制的文件清单。
>
> 请直接看 **[README.md](README.md)** —— 内含：
>
> - 环境要求（dsh 0.2.0-rc.2 / Node ≥ 18）
> - 四种安装方式：仓库 tarball、本地目录、手动改 profile、Release 压缩包
> - 安装后必做的三步（完全退出宿主 → 清洗 → 应用 → 自动重启 → 新开会话）
> - 安装验证清单、目录结构、运行时文件、配置项、CLI 与聊天命令
> - 更新 / 还原 / 卸载、12 条 FAQ、兼容性表、声明与署名
>
> 英文文档：[`README.en.md`](README.en.md)。原版 README（原作者版本，已归档）：[`docs/upstream/`](docs/upstream/)。

```powershell
# 最短路径：装到桌面宿主
dsh plugin --profile desktop add https://github.com/ZXEB/dsh-purge/archive/refs/heads/master.tar.gz
```
