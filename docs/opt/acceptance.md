# 验收记录

环境：Linux localhost 5.15.197-g708015331567-dirty #1 SMP PREEMPT Thu Aug 6 03:26:12 UTC 2026 aarch64 aarch64 aarch64 GNU/Linux
Node：v24.22.1
时间：2026-11-12T17:39:12+08:00

## npm run check
```
all modules: syntax OK
```

## npm test
```
69/69 passed
17/17 passed
```

## 目标发现
```
dsh-purge@1.1.71	/root/.dsh/profiles/web/node_modules/dsh-purge
dsh-purge-community@1.6.93	/root/.dsh/profiles/web/node_modules/dsh-purge-community
```

## dry-run
```
[dry] copy lib/runtime-state.js
[dry] copy lib/opt-signal.js
[dry] copy lib/opt-form.js
[dry] copy lib/opt-retry.js
[dry] copy lib/opt-lock.js
[dry] copy lib/opt-assemble.js
[dry] copy lib/opt-ladder.js
[dry] copy lib/opt-probe.js
[dry] copy lib/opt-budget.js
[dry] copy lib/opt.js
[dry] copy lib/opt-companion.js
[dry] update package.json exports
[dry] write cordis.patch.yml (append companion)

安装完成：dsh-purge-community @ /root/.dsh/profiles/web/node_modules/dsh-purge-community
下一步：完全退出 DSH → 重新打开 → 左侧 Purge → 状态 里点『应用』（会重写宿主补丁）→ 新开会话。
```
