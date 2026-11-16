# purge-opt · armor-kit 增强层

放在 `armor-kit/purge-opt/`，与 `install.sh`、`patch/apply.mjs` 一起装到社区版 `lib/`。

**前提：必须先装 `dsh-purge-community`。** 上游 `dsh-purge@1.1.71` 不能替代——
本包挂的是社区版的事件名与段名，1.1.71 里没有那些钩子，装了也不会被调用。

完整设计见 [`design.md`](design.md)。

```bash
cd purge-opt && npm run check && npm test     # 69 + 17 断言
```
