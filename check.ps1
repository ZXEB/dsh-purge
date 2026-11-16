#Requires -Version 5.1
<#
  dsh-purge pre-flight check (read-only)

  Runs before/after install on the target machine. It NEVER writes, patches,
  installs or deletes anything - it only reports what it can see.

  Usage:
    powershell -ExecutionPolicy Bypass -File .\check.ps1
    powershell -ExecutionPolicy Bypass -File .\check.ps1 -Profile web -DshHome "D:\dsh-home"
#>
[CmdletBinding()]
param(
  [ValidateSet('web', 'desktop')][string]$Profile = 'desktop',
  [string]$DshHome = '',
  [string]$PluginDir = ''
)

$ErrorActionPreference = 'Continue'

$script:problems = 0
$script:warnings = 0

function Head($m) { Write-Host ''; Write-Host "== $m ==" -ForegroundColor Cyan }
function Ok($m)   { Write-Host "  [ok]   $m" -ForegroundColor Green }
function Info($m) { Write-Host "  [info] $m" }
function Warn($m) { Write-Host "  [warn] $m" -ForegroundColor Yellow; $script:warnings++ }
function Bad($m)  { Write-Host "  [fail] $m" -ForegroundColor Red; $script:problems++ }

function Test-Ascii([string]$s) {
  if (-not $s) { return $false }
  foreach ($ch in $s.ToCharArray()) { if ([int]$ch -gt 127) { return $false } }
  return $true
}

# ---------- 0. host ----------
Head 'host'
Info "PowerShell : $($PSVersionTable.PSVersion)"
Info "OS         : $([System.Environment]::OSVersion.VersionString)"
Info "64-bit PS  : $([System.Environment]::Is64BitProcess)"

# ---------- 1. node ----------
Head 'node.js'
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
  Bad 'node.exe not found on PATH. Install Node.js >= 18 first.'
  $nodeExe = $null
} else {
  $nodeExe = $nodeCmd.Source
  $verText = (& $nodeExe --version) 2>$null
  $ver = ($verText -replace '^v', '').Split('.')[0]
  if ([int]$ver -ge 18) { Ok "node $verText at $nodeExe" } else { Bad "node $verText is too old (need >= 18)" }
}

# ---------- 2. dsh cli ----------
Head 'dsh cli'
$cli = $null
$cmd = Get-Command dsh -ErrorAction SilentlyContinue
if ($cmd) { $cli = $cmd.Source; Ok "on PATH: $cli" }
if (-not $cli) {
  $roots = @(
    (Join-Path $env:LOCALAPPDATA 'Programs\DeepSeek Harness'),
    (Join-Path $env:LOCALAPPDATA 'DeepSeek Harness'),
    (Join-Path $env:PROGRAMFILES 'DeepSeek Harness'),
    (Join-Path ${env:ProgramFiles(x86)} 'DeepSeek Harness')
  )
  foreach ($r in $roots) {
    if (-not $r) { continue }
    $p = Join-Path $r 'resources\runtime\cli\bin\dsh.cmd'
    if (Test-Path $p) { $cli = $p; break }
  }
  if ($cli) { Ok "bundled cli: $cli" } else { Warn 'dsh cli not found (PATH nor common install dirs). Manual install path still works.' }
}

# ---------- 3. DSH_HOME ----------
Head 'DSH_HOME'
$cands = @()
if ($DshHome) { $cands += $DshHome }
if ($env:DSH_HOME) { $cands += $env:DSH_HOME }
$cands += (Join-Path $env:USERPROFILE '.dsh')
$cands += (Join-Path $env:APPDATA 'DeepSeek Harness\dsh-home')
$cands += (Join-Path $env:LOCALAPPDATA 'DeepSeek Harness\dsh-home')

$found = @()
foreach ($c in $cands) {
  if (-not $c) { continue }
  if (Test-Path (Join-Path $c 'profiles')) {
    $found += (Resolve-Path $c).Path
  }
}
$found = $found | Select-Object -Unique
if ($found.Count -eq 0) {
  Bad 'no DSH_HOME with a profiles\ folder found. Launch the harness once.'
} else {
  foreach ($f in $found) { Info "candidate: $f" }
  if ($found.Count -gt 1) { Warn 'several DSH_HOME candidates - make sure you install into the one you actually run.' }
}

# ---------- 4. profile ----------
Head "profile '$Profile'"
$profileDir = $null
foreach ($f in $found) {
  $pd = Join-Path $f ('profiles\' + $Profile)
  if (Test-Path $pd) { $profileDir = $pd; break }
}
if (-not $profileDir) {
  if ($Profile -eq 'desktop') {
    Bad "profile 'desktop' not initialised. Start the desktop client once, quit it completely, then re-check."
  } else {
    Bad "profile '$Profile' not found under any DSH_HOME candidate."
  }
} else {
  Ok "profile dir: $profileDir"
}

# ---------- 5. paths ----------
Head 'path safety'
if ($profileDir) {
  if (Test-Ascii $profileDir) { Ok 'profile path is ASCII-only' } else { Warn 'profile path contains non-ASCII characters; pnpm may complain (install.ps1 stages to D:\dsh-plugins)' }
}
if (-not $PluginDir) { $PluginDir = $PSScriptRoot }
if (Test-Path $PluginDir) {
  if (Test-Ascii $PluginDir) { Ok "plugin path is ASCII-only: $PluginDir" } else { Warn "plugin path has non-ASCII characters: $PluginDir (install.ps1 copies it to an ASCII staging dir first)" }
  if (Test-Path (Join-Path $PluginDir 'package.json')) { Ok 'package.json present' } else { Bad "package.json missing under $PluginDir" }
} else {
  Warn "plugin dir not found: $PluginDir"
}

# ---------- 6. existing install ----------
Head 'existing dsh-purge install'
$installed = $false
if ($profileDir) {
  $manifest = Join-Path $profileDir 'package.json'
  if (Test-Path $manifest) {
    try {
      $j = Get-Content $manifest -Raw | ConvertFrom-Json
      $dep = $null
      $bundled = $false
      if ($j.PSObject.Properties.Name.Contains('dependencies')) {
        if ($j.dependencies.PSObject.Properties.Name.Contains('dsh-purge')) { $dep = $j.dependencies.'dsh-purge' }
      }
      if ($j.PSObject.Properties.Name.Contains('dsh')) {
        if (@($j.dsh.profile.bundles) -contains 'dsh-purge') { $bundled = $true }
      }
      if ($dep) { Ok "dependencies.dsh-purge = $dep" } else { Info 'dependencies.dsh-purge not set yet' }
      if ($bundled) { Ok 'dsh.profile.bundles contains dsh-purge' } else { Info 'dsh.profile.bundles does not contain dsh-purge yet' }
    } catch {
      Bad "profile package.json is not valid JSON: $($_.Exception.Message)"
      Info 'restore the package.json.bak-* backup next to it, or fix the BOM/commas'
    }
  }
  $nm = Join-Path $profileDir 'node_modules\dsh-purge\package.json'
  if (Test-Path $nm) {
    $installed = $true
    $v = (Get-Content $nm -Raw | ConvertFrom-Json).version
    Ok "node_modules\dsh-purge present (version $v)"
  } else {
    Info 'node_modules\dsh-purge not present yet'
  }
}

# ---------- 7. patch status ----------
Head 'patch status'
if ($installed -and $nodeExe -and $profileDir) {
  $entry = Join-Path (Join-Path $profileDir 'node_modules\dsh-purge') 'bin\dsh-purge.js'
  if (Test-Path $entry) {
    $savedHome = $env:DSH_HOME
    $env:DSH_HOME = Split-Path (Split-Path $profileDir -Parent) -Parent
    $out = & $nodeExe $entry --status 2>&1 | Out-String
    # status rows end with "- applied" / "- pending"; count by the ASCII words only,
    # because this script must stay pure ASCII for PowerShell 5.1.
    $applied = ([regex]::Matches($out, 'applied')).Count
    $pending = ([regex]::Matches($out, 'pending')).Count
    Write-Host $out
    Info "summary: applied=$applied pending=$pending"
    if ($pending -gt 0) { Info 'run install.ps1 -Apply (or the panel: Adapt -> Apply), then restart the harness' }
    $env:DSH_HOME = $savedHome
  } else {
    Warn "entry not found: $entry"
  }
} else {
  Info 'skipped (plugin not installed yet)'
}

# ---------- 8. verdict ----------
Head 'verdict'
if ($script:problems -eq 0) {
  Write-Host "  RESULT: ready." -ForegroundColor Green
  if (-not $installed) { Info 'next: run install.ps1 -Profile ' + $Profile }
} else {
  Write-Host "  RESULT: $($script:problems) blocking issue(s), $($script:warnings) warning(s)." -ForegroundColor Red
  exit 1
}
if ($script:warnings -gt 0) { Write-Host "  ($($script:warnings) warning(s) - not blocking)" -ForegroundColor Yellow }
