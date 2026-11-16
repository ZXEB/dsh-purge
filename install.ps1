#Requires -Version 5.1
<#
  dsh-purge installer for a second machine (Windows)
  Installs this plugin into an already installed DeepSeek Harness
  (desktop EXE or `dsh web`) and optionally applies the local patch table.

  Why this script exists:
    * `dsh plugin add <path>` shells out to pnpm. When the plugin path or the
      pnpm store path contains non-ASCII characters (e.g. a Chinese folder
      name) pnpm fails with ERR_PNPM_STORE_DIR_OPEN_OPERATION_LOCK.
      -> we always stage a copy under an ASCII-only directory first.
    * PowerShell 5.1's `Set-Content -Encoding UTF8` writes a BOM, which makes
      the harness fail to parse its own profile JSON.
      -> we write profile manifests through .NET with BOM-less UTF-8.

  Examples
    powershell -ExecutionPolicy Bypass -File .\install.ps1 -Profile desktop
    powershell -ExecutionPolicy Bypass -File .\install.ps1 -Profile web -DshHome "D:\dsh-home"
    powershell -ExecutionPolicy Bypass -File .\install.ps1 -Profile desktop -StatusOnly
    powershell -ExecutionPolicy Bypass -File .\install.ps1 -Profile desktop -Apply
    powershell -ExecutionPolicy Bypass -File .\install.ps1 -Profile desktop -Revert
#>
[CmdletBinding()]
param(
  [ValidateSet('web', 'desktop')][string]$Profile = 'desktop',
  [string]$DshHome = '',
  [string]$DshCli = '',
  [string]$PluginDir = '',
  [string]$StageDir = '',
  [switch]$StatusOnly,
  [switch]$Apply,
  [switch]$Revert
)

$ErrorActionPreference = 'Stop'

function Say-Ok($m)   { Write-Host "[+] $m" -ForegroundColor Green }
function Say-Info($m) { Write-Host "[-] $m" }
function Say-Warn($m) { Write-Host "[!] $m" -ForegroundColor Yellow }
function Say-Fail($m) { Write-Host "[x] $m" -ForegroundColor Red; exit 1 }

function Test-Ascii([string]$s) {
  if (-not $s) { return $false }
  foreach ($ch in $s.ToCharArray()) { if ([int]$ch -gt 127) { return $false } }
  return $true
}

function Write-Utf8NoBom([string]$path, [string]$text) {
  $enc = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($path, $text, $enc)
}

# ---------- 1. plugin source ----------
if (-not $PluginDir) { $PluginDir = $PSScriptRoot }
$pkgPath = Join-Path $PluginDir 'package.json'
if (-not (Test-Path $pkgPath)) {
  Say-Fail "package.json not found under '$PluginDir'. Pass -PluginDir <extracted folder>."
}
$PluginDir = (Resolve-Path $PluginDir).Path
$pkg = Get-Content $pkgPath -Raw | ConvertFrom-Json
Say-Ok "plugin source : $PluginDir"
Say-Ok "version       : dsh-purge $($pkg.version) / dshTarget $($pkg.dshTarget)"

$entrySrc = Join-Path $PluginDir 'bin\dsh-purge.js'
if (-not (Test-Path $entrySrc)) { Say-Fail "bin\dsh-purge.js missing under $PluginDir" }

$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) { Say-Fail 'node.exe not found on PATH (Node.js >= 18 required).' }
$nodeExe = $nodeCmd.Source

# ---------- 2. ASCII staging ----------
if (-not $StageDir) {
  if (Test-Path 'D:\') { $StageDir = 'D:\dsh-plugins' } else { $StageDir = 'C:\dsh-plugins' }
}
if (-not (Test-Ascii $StageDir)) {
  Say-Fail "StageDir contains non-ASCII characters ($StageDir). Pass -StageDir D:\dsh-plugins"
}
$stage = Join-Path $StageDir 'dsh-purge'

if ($StatusOnly -or $Revert) {
  # status/revert only need a runnable copy; use the source directly
  $entry = $entrySrc
} else {
  New-Item -ItemType Directory -Force -Path $StageDir | Out-Null
  Say-Info "staging copy  : $stage"
  if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
  Copy-Item $PluginDir $stage -Recurse -Force
  $entry = Join-Path $stage 'bin\dsh-purge.js'
  if (-not (Test-Path $entry)) { Say-Fail "staging failed: $entry missing" }
  Say-Ok "staged copy   : $stage"
}

# ---------- 3. locate DSH_HOME ----------
if (-not $DshHome) {
  $cands = @()
  if ($env:DSH_HOME) { $cands += $env:DSH_HOME }
  $cands += (Join-Path $env:USERPROFILE '.dsh')
  $cands += (Join-Path $env:APPDATA 'DeepSeek Harness\dsh-home')
  $cands += (Join-Path $env:LOCALAPPDATA 'DeepSeek Harness\dsh-home')
  foreach ($c in $cands) {
    if ($c -and (Test-Path (Join-Path $c 'profiles'))) { $DshHome = $c; break }
  }
}
if (-not $DshHome) {
  Say-Fail 'DSH_HOME not found. Launch the harness once, then pass -DshHome <path>.'
}
$DshHome = (Resolve-Path $DshHome).Path
$env:DSH_HOME = $DshHome
$profileDir = Join-Path $DshHome ('profiles\' + $Profile)
if (-not (Test-Path $profileDir)) {
  if ($Profile -eq 'desktop') {
    Say-Fail "Profile 'desktop' not initialised. Start the desktop client once, quit it completely, then re-run."
  }
  Say-Fail "Profile directory not found: $profileDir"
}
Say-Ok "DSH_HOME      : $DshHome"
Say-Ok "profile       : $Profile"

# ---------- 4. status / revert ----------
if ($StatusOnly) {
  & $nodeExe $entry --status
  exit $LASTEXITCODE
}
if ($Revert) {
  Say-Info 'reverting local patches from .dshpurge.bak backups'
  & $nodeExe $entry --revert
  exit $LASTEXITCODE
}

# ---------- 5. locate dsh CLI ----------
function Resolve-DshCli {
  if ($DshCli) {
    if (Test-Path $DshCli) { return $DshCli }
    Say-Warn "given -DshCli '$DshCli' does not exist"
  }
  $cmd = Get-Command dsh -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  $roots = @(
    (Join-Path $env:LOCALAPPDATA 'Programs\DeepSeek Harness'),
    (Join-Path $env:LOCALAPPDATA 'DeepSeek Harness'),
    (Join-Path $env:PROGRAMFILES 'DeepSeek Harness'),
    (Join-Path ${env:ProgramFiles(x86)} 'DeepSeek Harness')
  )
  foreach ($r in $roots) {
    if (-not $r) { continue }
    $p = Join-Path $r 'resources\runtime\cli\bin\dsh.cmd'
    if (Test-Path $p) { return $p }
  }
  return $null
}

$cli = Resolve-DshCli
if ($cli) { Say-Ok "dsh cli       : $cli" } else { Say-Warn 'dsh cli not located; will fall back to manual registration' }

# ---------- 6. install into the profile ----------
$profileJson = Join-Path $profileDir 'package.json'
if (Test-Path $profileJson) {
  $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  $backup = "$profileJson.bak-$stamp"
  Copy-Item $profileJson $backup -Force
  Say-Ok "profile backup: $backup"
}

$installed = Join-Path $profileDir 'node_modules\dsh-purge\package.json'
if (Test-Path $installed) {
  Say-Info "already installed: $installed"
}

if (-not (Test-Path $installed)) {
  # keep pnpm's store on the ASCII staging drive as well
  $env:npm_config_store_dir = Join-Path $StageDir 'pnpm-store'
  New-Item -ItemType Directory -Force -Path $env:npm_config_store_dir | Out-Null

  $done = $false
  if ($cli) {
    Say-Info "running: dsh plugin --profile $Profile add $stage"
    try {
      & $cli plugin --profile $Profile add $stage
      if (Test-Path $installed) { $done = $true }
    } catch {
      Say-Warn "dsh plugin add failed: $($_.Exception.Message)"
    }
    if (-not $done) {
      Say-Warn 'see the log path printed above (profiles\<name>\.plugin-manager\logs\)'
    }
  }

  if (-not $done) {
    Say-Warn 'switching to manual registration'
    $pluginsRoot = Join-Path $DshHome 'plugins'
    New-Item -ItemType Directory -Force -Path $pluginsRoot | Out-Null
    $target = Join-Path $pluginsRoot 'dsh-purge'
    if (Test-Path $target) { Remove-Item $target -Recurse -Force }
    try {
      cmd /c mklink /J "$target" "$stage" | Out-Null
      Say-Ok "junction      : $target -> $stage"
    } catch {
      Copy-Item $stage $target -Recurse -Force
      Say-Ok "copied        : $target"
    }

    $pjson = Get-Content $profileJson -Raw | ConvertFrom-Json
    if (-not $pjson.PSObject.Properties.Name.Contains('dependencies')) {
      $pjson | Add-Member -NotePropertyName dependencies -NotePropertyValue (New-Object psobject)
    }
    $pjson.dependencies | Add-Member -NotePropertyName 'dsh-purge' -NotePropertyValue 'file:../../plugins/dsh-purge' -Force

    if (-not $pjson.PSObject.Properties.Name.Contains('dsh')) {
      Say-Fail 'profile package.json has no "dsh" block. Add "dsh-purge" to dsh.profile.bundles manually (README 4.2).'
    }
    $bundles = @($pjson.dsh.profile.bundles)
    if ($bundles -notcontains 'dsh-purge') { $bundles += 'dsh-purge' }
    $pjson.dsh.profile.bundles = $bundles
    # BOM-less write: a BOM here breaks the harness profile parser.
    Write-Utf8NoBom $profileJson ($pjson | ConvertTo-Json -Depth 12)
    Say-Ok "registered    : dsh-purge in dsh.profile.bundles"

    $nm = Join-Path $profileDir 'node_modules'
    New-Item -ItemType Directory -Force -Path $nm | Out-Null
    $link = Join-Path $nm 'dsh-purge'
    if (-not (Test-Path $link)) {
      try { cmd /c mklink /J "$link" "$stage" | Out-Null } catch { Copy-Item $stage $link -Recurse -Force }
    }
  }
}

if (-not (Test-Path $installed)) {
  Say-Warn "expected file is missing: $installed"
  Say-Info 'manual steps: README.md section 4.2'
  exit 1
}
Say-Ok "installed     : $installed"

# ---------- 7. status / optional apply ----------
Write-Host ''
Say-Info 'patch status:'
& $nodeExe $entry --status

if ($Apply) {
  Write-Host ''
  Say-Info 'applying local patch table'
  & $nodeExe $entry --apply
  Write-Host ''
  Say-Warn 'now QUIT the harness completely and reopen it, then start a new session.'
} else {
  Write-Host ''
  Say-Info 'next steps:'
  Say-Info '  1) quit the harness completely, reopen it'
  Say-Info '  2) open the dsh-purge panel next to the session title -> Adapt -> Apply'
  Say-Info '  3) (or re-run this script with -Apply)'
}
