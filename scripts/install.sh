#!/bin/sh
# ZXEB/dsh-purge remote installer for macOS / Linux.
# Downloads the official GitHub Release tarball (.tgz), verifies SHA256 against
# SHA256SUMS.txt, stores it in $DSH_HOME/dsh-purge/archives, backs up the target
# profile package.json, and installs via official `dsh plugin add`.
# Never modifies global PATH, proxy, npm registry, or auto-restarts DSH.
set -eu

REPO="ZXEB/dsh-purge"
PROFILE="${DSH_PROFILE:-}"
VERSION="${PURGE_VERSION:-}"
DSH_HOME_ARG="${DSH_HOME:-}"
DSH_CLI_ARG="${PURGE_DSH_CLI:-}"
DRY_RUN=0
APPLY=0

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --apply) APPLY=1 ;;
    --profile=*) PROFILE="${arg#--profile=}" ;;
    --version=*) VERSION="${arg#--version=}" ;;
    --dsh-home=*) DSH_HOME_ARG="${arg#--dsh-home=}" ;;
    --dsh-cli=*) DSH_CLI_ARG="${arg#--dsh-cli=}" ;;
    --help|-h)
      cat <<'HELP'
Usage: sh install.sh [--dry-run] [--profile=web|desktop] [--version=X.Y.Z] [--dsh-home=DIR] [--dsh-cli=PATH] [--apply]
  macOS default profile: desktop (or web if only CLI/web profile exists)
  Linux default profile: web
HELP
      exit 0 ;;
    *)
      echo "[x] Unknown argument: $arg" >&2
      exit 1 ;;
  esac
done

say_ok()   { printf '[+] %s\n' "$1"; }
say_info() { printf '[-] %s\n' "$1"; }
say_fail() { printf '[x] %s\n' "$1" >&2; exit 1; }

command -v curl >/dev/null 2>&1 || say_fail "curl is required."

# 1. Locate DSH_HOME
if [ -n "$DSH_HOME_ARG" ]; then
  DSH_HOME_DIR="$DSH_HOME_ARG"
elif [ -d "$HOME/.dsh/profiles" ]; then
  DSH_HOME_DIR="$HOME/.dsh"
elif [ -d "$HOME/Library/Application Support/DeepSeek Harness/dsh-home/profiles" ]; then
  DSH_HOME_DIR="$HOME/Library/Application Support/DeepSeek Harness/dsh-home"
else
  say_fail "DSH_HOME not found. Launch DSH once to initialize your profile, or pass --dsh-home=<path>."
fi

# 2. Determine profile
if [ -z "$PROFILE" ]; then
  if [ "$(uname -s)" = "Darwin" ] && [ -d "$DSH_HOME_DIR/profiles/desktop" ]; then
    PROFILE="desktop"
  elif [ -d "$DSH_HOME_DIR/profiles/web" ]; then
    PROFILE="web"
  elif [ -d "$DSH_HOME_DIR/profiles/desktop" ]; then
    PROFILE="desktop"
  else
    PROFILE="web"
  fi
fi

PROFILE_DIR="$DSH_HOME_DIR/profiles/$PROFILE"
[ -d "$PROFILE_DIR" ] || say_fail "Profile directory not found: $PROFILE_DIR (open DSH once first)."

# 3. Locate DSH CLI
if [ -n "$DSH_CLI_ARG" ]; then
  DSH_CLI="$DSH_CLI_ARG"
elif command -v dsh >/dev/null 2>&1; then
  DSH_CLI="$(command -v dsh)"
elif [ -x "/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh" ]; then
  DSH_CLI="/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh"
else
  say_fail "dsh CLI not found on PATH. Install DSH first or pass --dsh-cli=<path>."
fi

say_ok "DSH_HOME : $DSH_HOME_DIR"
say_ok "profile  : $PROFILE"
say_ok "dsh cli  : $DSH_CLI"

# 4. Resolve release version (rate-limit-free: market index -> releases/latest redirect)
TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/dsh-purge-dl.XXXXXX")"
trap 'rm -rf "$TMP_DIR"' 0
trap 'exit 130' INT
trap 'exit 143' TERM

if [ -n "$VERSION" ]; then
  VER="${VERSION#v}"
else
  say_info "checking latest version via market index..."
  VER="$(curl -fsSL --connect-timeout 20 --max-time 30 -A "dsh-purge-installer" "https://zxeb.github.io/dsh-purge/index.json" 2>/dev/null \
    | sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([0-9][0-9]*\.[0-9][0-9]*\.[0-9][0-9]*\)".*/\1/p' | head -n 1 || true)"
  if [ -z "$VER" ]; then
    FINAL_URL="$(curl -fsSLI -o /dev/null -w '%{url_effective}' --connect-timeout 20 --max-time 30 -A "dsh-purge-installer" "https://github.com/$REPO/releases/latest" || true)"
    TAG_FALLBACK="${FINAL_URL##*/}"
    VER="${TAG_FALLBACK#v}"
  fi
fi

[ -n "$VER" ] || say_fail "Failed to resolve latest release version. Pass --version=X.Y.Z."
TAG="v${VER}"
TGZ_NAME="dsh-purge-${VER}.tgz"
TGZ_URL="https://github.com/$REPO/releases/download/$TAG/$TGZ_NAME"
SUM_URL="https://github.com/$REPO/releases/download/$TAG/SHA256SUMS.txt"

say_ok "release  : $TAG ($TGZ_NAME)"

# 5. Download and verify SHA256
say_info "downloading $TGZ_NAME ..."
curl -fsSL --connect-timeout 20 --max-time 120 -A "dsh-purge-installer" "$TGZ_URL" -o "$TMP_DIR/$TGZ_NAME"
curl -fsSL --connect-timeout 20 --max-time 60  -A "dsh-purge-installer" "$SUM_URL" -o "$TMP_DIR/SHA256SUMS.txt"

EXPECTED="$(awk -v name="$TGZ_NAME" '{ f=$2; sub(/^\*/, "", f); if (f == name) { print tolower($1); exit } }' "$TMP_DIR/SHA256SUMS.txt")"
[ -n "$EXPECTED" ] || say_fail "SHA256SUMS.txt does not contain $TGZ_NAME"

if command -v sha256sum >/dev/null 2>&1; then
  ACTUAL="$(sha256sum "$TMP_DIR/$TGZ_NAME" | awk '{ print tolower($1) }')"
elif command -v shasum >/dev/null 2>&1; then
  ACTUAL="$(shasum -a 256 "$TMP_DIR/$TGZ_NAME" | awk '{ print tolower($1) }')"
else
  say_fail "Neither sha256sum nor shasum is available for verification."
fi

[ "$ACTUAL" = "$EXPECTED" ] || say_fail "SHA256 mismatch! expected=$EXPECTED actual=$ACTUAL"
say_ok "SHA256   : $ACTUAL (verified)"

ARCHIVE_DIR="$DSH_HOME_DIR/dsh-purge/archives"
DEST_TGZ="$ARCHIVE_DIR/$TGZ_NAME"

if [ "$DRY_RUN" -eq 1 ]; then
  say_ok "dry-run passed (target archive: $DEST_TGZ). Re-run without --dry-run to install."
  exit 0
fi

# 6. Persist archive & backup profile
mkdir -p "$ARCHIVE_DIR"
cp "$TMP_DIR/$TGZ_NAME" "$DEST_TGZ"
say_ok "archived : $DEST_TGZ"

if [ -f "$PROFILE_DIR/package.json" ]; then
  STAMP="$(date +%Y%m%d-%H%M%S)"
  BACKUP="$PROFILE_DIR/package.json.bak-$STAMP"
  cp "$PROFILE_DIR/package.json" "$BACKUP"
  say_ok "backup   : $BACKUP"
fi

# 7. Install via official DSH CLI
export DSH_HOME="$DSH_HOME_DIR"
say_info "running: $DSH_CLI plugin --profile $PROFILE add $DEST_TGZ"
"$DSH_CLI" plugin --profile "$PROFILE" add "$DEST_TGZ"

INSTALLED_PKG="$PROFILE_DIR/node_modules/dsh-purge/package.json"
[ -f "$INSTALLED_PKG" ] || say_fail "Install completed but $INSTALLED_PKG is missing."
say_ok "installed: dsh-purge@$VER into profile '$PROFILE'"

if [ "$APPLY" -eq 1 ] && command -v node >/dev/null 2>&1; then
  say_info "applying local patch table..."
  node "$PROFILE_DIR/node_modules/dsh-purge/bin/dsh-purge.js" --apply
fi

printf '\n'
say_ok "Done! Quit and reopen DSH, then open dsh-purge -> Adapt -> Apply."
