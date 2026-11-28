#Requires -Version 5.1
<#
  ZXEB/dsh-purge remote installer for Windows (PowerShell 5.1 / 7)
  Downloads the official GitHub Release tarball (.tgz), verifies SHA256 against
  SHA256SUMS.txt, saves it to a persistent ASCII archive path, backs up the
  target profile package.json, and installs via official `dsh plugin add`.
  Never modifies global PATH, proxy, npm registry, or auto-restarts DSH.

  Examples:
    # Preview (verify release, SHA256, DSH_HOME, CLI without modifying profile)
    powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1 -DryRun

    # Install into desktop profile (default)
    powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1

    # Install into web profile or pin a version
    powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1 -Profile web -Version 1.1.77
#>
[CmdletBinding()]
param(
  [ValidateSet('desktop', 'web')][string]$Profile = $(if ($env:DSH_PROFILE) { $env:DSH_PROFILE } else { 'desktop' }),
  [string]$Version = $env:PURGE_VERSION,
  [string]$DshHome = $env:DSH_HOME,
  [string]$DshCli = $env:PURGE_DSH_CLI,
  [string]$ArchiveDir = '',
  [switch]$DryRun,
  [switch]$Apply
)

$ErrorActionPreference = 'Stop'
$Repo = 'ZXEB/dsh-purge'

function Say-Ok($m)   { Write-Host "[+] $m" -ForegroundColor Green }
function Say-Info($m) { Write-Host "[-] $m" }
function Say-Warn($m) { Write-Host "[!] $m" -ForegroundColor Yellow }
function Say-Fail($m) { Write-Host "[x] $m" -ForegroundColor Red; exit 1 }

function Test-Ascii([string]$s) {
  if (-not $s) { return $false }
  foreach ($ch in $s.ToCharArray()) { if ([int]$ch -gt 127) { return $false } }
  return $true
}

function Resolve-DshHome {
  if ($DshHome) {
    if (-not (Test-Path -LiteralPath $DshHome)) { Say-Fail "DSH_HOME does not exist: $DshHome" }
    return (Resolve-Path -LiteralPath $DshHome).Path
  }
  $cands = @(
    (Join-Path $env:USERPROFILE '.dsh'),
    (Join-Path $env:APPDATA 'DeepSeek Harness\dsh-home'),
    (Join-Path $env:LOCALAPPDATA 'DeepSeek Harness\dsh-home')
  )
  foreach ($c in $cands) {
    if ($c -and (Test-Path -LiteralPath (Join-Path $c 'profiles'))) {
      return (Resolve-Path -LiteralPath $c).Path
    }
  }
  Say-Fail 'DSH_HOME not found. Launch DeepSeek Harness once to initialize your profile, or pass -DshHome <path>.'
}

function Resolve-DshCli {
  if ($DshCli) {
    if (Test-Path -LiteralPath $DshCli -PathType Leaf) { return (Resolve-Path -LiteralPath $DshCli).Path }
    Say-Fail "Specified -DshCli does not exist: $DshCli"
  }
  $cmd = Get-Command dsh -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }

  $roots = @()
  foreach ($proc in @(Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.ProcessName -in @('DeepSeek Harness', 'DSH Desktop') })) {
    if ($proc.Path) { $roots += (Split-Path -Parent $proc.Path) }
  }
  foreach ($key in @('HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*', 'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*')) {
    foreach ($entry in @(Get-ItemProperty $key -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -in @('DeepSeek Harness', 'DSH Desktop') })) {
      if ($entry.InstallLocation) { $roots += $entry.InstallLocation }
    }
  }
  $roots += @(
    (Join-Path $env:LOCALAPPDATA 'Programs\DeepSeek Harness'),
    (Join-Path $env:LOCALAPPDATA 'Programs\DSH Desktop'),
    (Join-Path $env:LOCALAPPDATA 'DeepSeek Harness'),
    (Join-Path $env:PROGRAMFILES 'DeepSeek Harness'),
    (Join-Path ${env:ProgramFiles(x86)} 'DeepSeek Harness')
  )

  foreach ($r in ($roots | Where-Object { $_ } | Select-Object -Unique)) {
    foreach ($rel in @('resources\runtime\cli\bin\dsh.cmd', 'resources\app\runtime\cli\bin\dsh.cmd')) {
      $p = Join-Path $r $rel
      if (Test-Path -LiteralPath $p -PathType Leaf) { return (Resolve-Path -LiteralPath $p).Path }
    }
  }
  Say-Fail 'DSH CLI (dsh / dsh.cmd) not found. Pass -DshCli "<install dir>\resources\runtime\cli\bin\dsh.cmd".'
}

function Download-File([string]$Uri, [string]$OutFile) {
  $headers = @{ 'User-Agent' = 'dsh-purge-installer' }
  try {
    Invoke-WebRequest -UseBasicParsing -TimeoutSec 120 -Headers $headers -Uri $Uri -OutFile $OutFile
    return
  } catch {
    $curl = Get-Command curl.exe -ErrorAction SilentlyContinue
    if (-not $curl) { throw }
    Say-Warn "Invoke-WebRequest failed for $Uri; retrying with system curl.exe"
    & $curl.Source -fsSL --connect-timeout 20 --max-time 120 -A 'dsh-purge-installer' $Uri -o $OutFile
    if ($LASTEXITCODE -ne 0) { throw "curl.exe failed with exit code $LASTEXITCODE" }
  }
}

$prevProtocol = [Net.ServicePointManager]::SecurityProtocol
[Net.ServicePointManager]::SecurityProtocol = $prevProtocol -bor [Net.SecurityProtocolType]::Tls12

$tmpDir = Join-Path ([IO.Path]::GetTempPath()) ('dsh-purge-dl-' + [guid]::NewGuid().ToString('N'))
try {
  # 1. Resolve DSH instance
  $resolvedHome = Resolve-DshHome
  $profileDir = Join-Path $resolvedHome ('profiles\' + $Profile)
  if (-not (Test-Path -LiteralPath $profileDir)) {
    Say-Fail "Profile '$Profile' not initialized under $resolvedHome. Launch DSH once, then retry."
  }
  $cli = Resolve-DshCli
  Say-Ok "DSH_HOME      : $resolvedHome"
  Say-Ok "profile       : $Profile"
  Say-Ok "dsh cli       : $cli"

  # 2. Resolve release metadata
  $apiUrl = if ($Version) {
    $v = $Version.TrimStart('v')
    "https://api.github.com/repos/$Repo/releases/tags/v$v"
  } else {
    "https://api.github.com/repos/$Repo/releases/latest"
  }
  Say-Info "querying release: $apiUrl"
  $release = Invoke-RestMethod -Headers @{ 'User-Agent' = 'dsh-purge-installer'; Accept = 'application/vnd.github+json' } -TimeoutSec 30 -Uri $apiUrl
  $tag = [string]$release.tag_name
  $ver = $tag.TrimStart('v')
  $tgzName = "dsh-purge-$ver.tgz"
  $tgzAsset = $release.assets | Where-Object { $_.name -eq $tgzName } | Select-Object -First 1
  $sumAsset = $release.assets | Where-Object { $_.name -eq 'SHA256SUMS.txt' } | Select-Object -First 1
  if (-not $tgzAsset) { Say-Fail "Release $tag does not contain $tgzName" }
  if (-not $sumAsset) { Say-Fail "Release $tag does not contain SHA256SUMS.txt" }
  Say-Ok "release       : $tag ($tgzName)"

  # 3. Download and verify SHA256
  New-Item -ItemType Directory -Force -Path $tmpDir | Out-Null
  $tmpTgz = Join-Path $tmpDir $tgzName
  $tmpSum = Join-Path $tmpDir 'SHA256SUMS.txt'
  Say-Info "downloading $tgzName ..."
  Download-File $tgzAsset.browser_download_url $tmpTgz
  Download-File $sumAsset.browser_download_url $tmpSum

  $expectedHash = $null
  foreach ($line in (Get-Content -LiteralPath $tmpSum)) {
    if ($line -match '^\s*([0-9a-fA-F]{64})\s+\*?(.+?)\s*$') {
      if ($Matches[2].Trim() -eq $tgzName) {
        $expectedHash = $Matches[1].ToLowerInvariant()
        break
      }
    }
  }
  if (-not $expectedHash) { Say-Fail "SHA256SUMS.txt has no entry for $tgzName" }
  $actualHash = (Get-FileHash -LiteralPath $tmpTgz -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($actualHash -ne $expectedHash) {
    Say-Fail "SHA256 mismatch for $tgzName! expected=$expectedHash actual=$actualHash"
  }
  Say-Ok "SHA256        : $actualHash (verified)"

  # 4. Persistent ASCII archive directory (avoids pnpm non-ASCII store lock & broken temp links)
  if (-not $ArchiveDir) {
    $candidateHomeArchive = Join-Path $resolvedHome 'dsh-purge\archives'
    if (Test-Ascii $candidateHomeArchive) {
      $ArchiveDir = $candidateHomeArchive
    } elseif (Test-Path 'D:\') {
      $ArchiveDir = 'D:\dsh-plugins\dsh-purge-archives'
    } else {
      $ArchiveDir = 'C:\dsh-plugins\dsh-purge-archives'
    }
  }
  if (-not (Test-Ascii $ArchiveDir)) {
    Say-Fail "ArchiveDir must be ASCII-only to avoid pnpm lock errors: $ArchiveDir"
  }
  $destTgz = Join-Path $ArchiveDir $tgzName

  if ($DryRun) {
    Say-Ok "dry-run passed (target archive: $destTgz). Re-run without -DryRun to install."
    exit 0
  }

  New-Item -ItemType Directory -Force -Path $ArchiveDir | Out-Null
  Copy-Item -LiteralPath $tmpTgz -Destination $destTgz -Force
  Say-Ok "saved archive : $destTgz"

  # 5. Backup profile package.json
  $profileJson = Join-Path $profileDir 'package.json'
  if (Test-Path -LiteralPath $profileJson) {
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $backup = "$profileJson.bak-$stamp"
    Copy-Item -LiteralPath $profileJson -Destination $backup -Force
    Say-Ok "profile backup: $backup"
  }

  # 6. Install via official DSH CLI
  $env:DSH_HOME = $resolvedHome
  $pnpmStore = Join-Path (Split-Path -Parent $ArchiveDir) 'pnpm-store'
  if (Test-Ascii $pnpmStore) {
    New-Item -ItemType Directory -Force -Path $pnpmStore | Out-Null
    $env:npm_config_store_dir = $pnpmStore
  }

  Say-Info "running: dsh plugin --profile $Profile add $destTgz"
  & $cli plugin --profile $Profile add $destTgz
  if ($LASTEXITCODE -ne 0) {
    Say-Fail "dsh plugin add failed with exit code $LASTEXITCODE (profile backup kept)"
  }

  $installedPkgPath = Join-Path $profileDir 'node_modules\dsh-purge\package.json'
  if (-not (Test-Path -LiteralPath $installedPkgPath)) {
    Say-Fail "Installation finished but $installedPkgPath was not found."
  }
  $installedPkg = Get-Content -LiteralPath $installedPkgPath -Raw | ConvertFrom-Json
  Say-Ok "installed     : dsh-purge@$($installedPkg.version) into profile '$Profile'"

  if ($Apply) {
    $nodeCmd = Get-Command node -ErrorAction SilentlyContinue
    $entry = Join-Path $profileDir 'node_modules\dsh-purge\bin\dsh-purge.js'
    if ($nodeCmd -and (Test-Path -LiteralPath $entry)) {
      Say-Info 'applying local patch table...'
      & $nodeCmd.Source $entry --apply
    } else {
      Say-Warn 'node.exe not on PATH; open DSH panel -> Adapt -> Apply after restart.'
    }
  }

  Write-Host ''
  Say-Ok 'Done! Next steps:'
  Say-Info '  1) Completely quit DeepSeek Harness (tray right-click -> Quit) and reopen it.'
  if (-not $Apply) {
    Say-Info '  2) Click dsh-purge next to the session title -> Adapt -> Apply.'
  }
} finally {
  [Net.ServicePointManager]::SecurityProtocol = $prevProtocol
  if (Test-Path -LiteralPath $tmpDir) {
    Remove-Item -LiteralPath $tmpDir -Recurse -Force -ErrorAction SilentlyContinue
  }
}
