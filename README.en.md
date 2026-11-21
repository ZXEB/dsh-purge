<p align="center">
  <img src="docs/banner.svg" alt="dsh-purge" width="720">
</p>

<h1 align="center">dsh-purge — local runtime adaptation plugin for DeepSeek Harness</h1>

<p align="center"><strong>Adapted build v1.1.76 · targets dsh 0.2.2-rc.5</strong></p>

<p align="center">
  <a href="README.md">中文</a> | <a href="README.en.md">English</a>
</p>

> This is a **compatibility rebuild** of `dsh-purge`. It adapts the default values and prompt segments of an officially installed DeepSeek Harness **on your own machine**. The original repository and its npm package are gone, so installing by package name (`dsh plugin add dsh-purge`) does not work — use one of the local installation paths below.
>
> The patch anchors and runtime hooks were calibrated against **dsh 0.2.2-rc.5**; see [ADAPTATION-NOTES.md](ADAPTATION-NOTES.md) for the per-entry record.

---

## 1. What it is

A plugin for an **already installed** official DeepSeek Harness. It does not touch model weights and does not modify the Harness source tree. It works at the **host layer**:

1. **Unified local defaults.** Several host behaviours are decided by hard-coded defaults (prompt segment wording, approval policy defaults, sandbox mode defaults, tool descriptions, deliverable card behaviour). This plugin keeps a **reversible patch table** that maps those defaults to one consistent local set on your installation.
2. **One place to inspect and maintain them.** The side panel lists every entry with its state (`applied` / `pending` / `skipped` / `missing_file`), plus apply / revert / uninstall and prompt / ruleset editing.

| You get | Notes |
|---|---|
| **Side panel** | Button next to the session title; two pages: **Adapt** and **Drill (optional module)** |
| **Adapt page** | Grouped patch states; apply / revert / uninstall; prompt editing; multiple rulesets |
| **Drill page** | Local asset and skill inventory; requires confirming the notice on first use — ignore it if unused |
| **Host defaults** | Unified prompt segments, permission policy, tool limits, card behaviour; official features retained |
| **Startup self-check** | Optional; survives `node_modules` being replaced by npm/pnpm |

Supports the official **Web** host (`dsh web`) and the official **desktop EXE**. Each host has its own `$DSH_HOME`; install and apply **per host**.

Path detection order: `$DSH_HOME` → `.dsh` next to the dsh launcher → `~/.dsh`.

---

## 2. Requirements

| Item | Requirement |
|---|---|
| dsh | **0.2.2-rc.5** (`dshTarget`); 0.2.0 / 0.2.1 / 0.2.2-rc.1~rc.4 also work, a few entries show `skipped` |
| Host | Official desktop EXE (profile `desktop`) or official `dsh web` (profile `web`) |
| Node.js | **≥ 18** (`≥ 22` for no console flash on Windows) |
| Package manager | The pnpm bundled with dsh (called by `dsh plugin`); no separate install needed |
| Network | Not required — install from a local directory works offline |

---

## 3. Install

### 3.0 Pick the profile

| You run | profile | Note |
|---|---|---|
| Official desktop EXE | `desktop` | Profile appears only after the client has been launched once; **quit it completely** before installing |
| Official `dsh web` | `web` | Stop the running `dsh web` first |

Find the `$DSH_HOME` you are actually using (a machine often has two):

```powershell
$cands = @()
if ($env:DSH_HOME) { $cands += $env:DSH_HOME }
$cands += "$env:USERPROFILE\.dsh"
$cands += @("$env:APPDATA\DeepSeek Harness\dsh-home", "$env:LOCALAPPDATA\DeepSeek Harness\dsh-home")
$cands | Select-Object -Unique | Where-Object { $_ -and (Test-Path (Join-Path $_ "profiles")) }
```

### 3.1 Option A — install from the local directory (recommended, offline)

```powershell
# Web host
dsh plugin --profile web add D:\path\to\dsh-purge-0.2.2

# Desktop host (quit the desktop client first)
dsh plugin --profile desktop add D:\path\to\dsh-purge-0.2.2
```

```sh
dsh plugin --profile web add /path/to/dsh-purge-0.2.2
```

Copy **the whole directory** (`lib/ client.js docs/ presets/ skills/ bin/`). `client.js` is the built side-panel bundle; without it you get the CLI only.

### 3.2 Option B — manual install (fallback)

1. Copy this directory to `$DSH_HOME/plugins/dsh-purge` (the folder name and the `"name"` field in `package.json` must both be `dsh-purge`).
2. In `$DSH_HOME/profiles/<web|desktop>/package.json`, add exactly two things: `"dsh-purge": "file:../../plugins/dsh-purge"` under `dependencies`, and `"dsh-purge"` at the end of `dsh.profile.bundles`.
3. `cd` into that profile directory and run `pnpm install`. Success means `profiles/<web|desktop>/node_modules/dsh-purge/package.json` exists.

### 3.3 One-shot script (Windows)

```powershell
powershell -ExecutionPolicy Bypass -File .\install.ps1 -Profile desktop
powershell -ExecutionPolicy Bypass -File .\install.ps1 -Profile desktop -StatusOnly
```

A read-only pre-flight / post-install check (writes nothing):

```powershell
powershell -ExecutionPolicy Bypass -File .\check.ps1 -Profile desktop
```

It reports the Node version, the dsh CLI, every `DSH_HOME` candidate, whether the profile is initialised, whether paths are ASCII-only, whether a plugin is already installed, and an applied/pending summary, ending with `RESULT: ready.` or the blocking items.

### 3.4 If `dsh` is not on PATH

The desktop build ships a CLI, usually at `<install dir>\resources\runtime\cli\bin\dsh.cmd`; it takes the same arguments.

### 3.5 After installing

1. **Quit and reopen** that host completely.
2. In that host, open **dsh-purge** next to the session title → **Adapt** → **Apply**.
3. A successful apply restarts the host once; the patch takes effect after the restart, and prompt segments apply to a new session.

CLI equivalent: `node <plugin dir>\bin\dsh-purge.js --apply`.

### 3.6 Verify

- [ ] `dependencies.dsh-purge` **and** `dsh.profile.bundles` both list `dsh-purge`
- [ ] `profiles/<web|desktop>/node_modules/dsh-purge/package.json` exists
- [ ] The **dsh-purge** button appears next to the session title
- [ ] `/purge status` prints the `DSH_HOME` you are actually running
- [ ] Tools `purge_status` / `purge_apply` / `purge_revert` are exposed to the model
- [ ] `node <plugin>\bin\dsh-purge.js --status` lists patch states

Entries for optional third-party packages (mnemon / liangshen and similar) show `skipped` / `missing_file` when those packages are absent. That is expected and does not block apply.

---

## 4. Usage

```sh
dsh-purge --status | --apply | --revert | --uninstall | --edit | --help

/purge status | apply | revert | uninstall | edit | help
/rules list | use <id> | create <id> | delete <id> | reset | help
/skills list | import <zip or folder> | create <id> [desc] | delete <id> | help
/rewind
```

---

## 5. Configuration

Edit the `dsh-purge` entry in `$DSH_HOME/profiles/<web|desktop>/cordis.patch.yml` and restart the host. The interesting keys:

| Key | Default | Meaning |
|---|---|---|
| `enabled` | `true` | master switch |
| `autoApplyOnStart` | `false` | re-apply on every start |
| `autoUpdateOnStart` | `false` | check for updates on start |
| `stripMnemon` | `true` | drop mnemon sections |
| `verbose` | `false` | verbose console logging |
| `postPrompt` / `postPromptOrder` | `""` / `5100` | extra prompt segment and its order |
| `autoRetry` / `retryMax` | `true` / `3` | retry failed requests |
| `autoContinue` / `continueMax` / `continueText` | `false` / `3` / `继续` | automatic continuation |
| `capabilityProtocol` | `true` | inject the capability protocol section |

---

## 6. How it works

On apply (or startup self-check): if an entry is already in effect it is skipped (idempotent); otherwise the target file is backed up as `<file>.dshpurge.bak`, the patch table is applied, the `dsh` shim is written, and the bundled prompt segment is mounted.

Matching is **plain-text anchoring**. When upstream rewording invalidates an anchor, the entry reports `skipped` and the file is left untouched — no half-patched output. This build re-validated every anchor and runtime hook against the real dsh 0.2.2-rc.5 artifacts and syntax-checked the patched output.

---

## 7. Update / revert / uninstall

- **Revert**: `dsh-purge --revert` (or `/purge revert`) restores every `<file>.dshpurge.bak` and removes the shim lines it wrote. `prompt-inject.md` is a user file and is kept.
- **Uninstall**: `dsh-purge --uninstall` reverts first, then removes injected files, the rules store and the plugin registration.
- **Upgrade**: replace the directory, reinstall, apply once. `autoApplyOnStart: true` covers `node_modules` being replaced.

---

## 8. Compatibility

| Plugin | dsh | Note |
|---|---|---|
| **1.1.76** (this build) | **0.2.2-rc.5** | calibrated against rc.5 + `pi-ai@1.6`; fixes redteam preset/subagent APIs/`CONTENT_REFUSED`, restores `#32` `#56` `#77` `#57` |
| 1.1.76 downward | 0.2.2-rc.1~rc.4, 0.2.1-rc.x, 0.2.0-rc.2 | status probe shows **0 regressions**; legacy anchors and `listChildren` fallback kept |
| 1.1.75 | 0.2.2-rc.3 | `{{cwd}}` compat, assemble error propagation, DSML native-tool guard |
| 1.1.73–1.1.74 | 0.2.2-rc.3 | anchor recalibration + read-first & hooks idempotency fixes |
| 1.1.71 (upstream mirror) | 0.2.0-rc.2 | 6 anchors miss on 0.2.2 |

Misses surface as `skipped` for that entry only and never leave half-patched files. After applying on 0.2.2, only `#40` (0.1.5-only) and `#80` (legacy minimal toolset rollback) remain `skipped`.

---

## 9. Attribution & license

MIT licensed. Attribution follows the original author's terms: if you reuse the name, the approach, code or prompts, credit the source. Original: **`YuJunZhiXue/dsh-purge` (author: 小杨)**; mirror rebuild: **`ZXEB/dsh-purge`**; this directory is the adapted rebuild.

Scope: it operates on **your own installed Harness** (local `@deepseek-ai` packages, profiles and `$DSH_HOME`) or environments you administer. Do not point it at other people's machines, accounts or systems.

Provided as-is under MIT, without warranty; you are responsible for deployment, operation, modification and distribution.

See [LICENSE](LICENSE) (the original copyright line `Copyright (c) 2026 小杨` is retained).
