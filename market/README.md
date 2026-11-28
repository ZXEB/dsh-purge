# DSH 自定义插件市场索引

在 DSH「插件 → 发现 → 添加索引源」中填入下方网址：

```text
https://zxeb.github.io/dsh-purge/index.json
```

如果没有看到「发现」标签页，请先到「插件 → 实验性插件 → 更多」启用「自定义插件市场 / 自定义插件索引」。

- 索引严格遵循 DSH 官方 format 1 规范，并在发布前通过 `@deepseek-ai/dsh-plugin-market-index` 校验。
- 所有版本均来自已发布的稳定 GitHub Release，且固定到 40 位完整 Git Commit SHA。
- 每次 `Release` 工作流发布新版本后，GitHub Actions 会自动重建并部署 GitHub Pages，无需手工维护索引文件。
