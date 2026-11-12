# dsh-purge-opt — 1.1.71 对照增强补丁包

对照对象：本机安装的 `dsh-purge-community@1.6.93`
对照基线：本仓库 `master`（package.json `1.1.71`，commit `719a741`）

不改宿主源码、不改上游文件。一组可选增强层：装进已安装插件的 `lib/`，
由 `cordis.patch.yml` 多插一个 companion 插件，把各层挂到同一个 ctx 上。
卸载 = 删文件 + 删那一行。

完整说明见 [`opt/dsh-purge/README.md`](../../opt/dsh-purge/README.md)，
验收记录见 [`acceptance.md`](acceptance.md)。

```bash
cd opt/dsh-purge
npm run check && npm test          # 69 + 17 条断言
node scripts/install.mjs --discover
node scripts/install.mjs --target <插件目录>
```
