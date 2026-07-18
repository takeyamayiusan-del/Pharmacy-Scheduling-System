# Watchdog: keep Supabase + ALL sites up together (every minute)
$ErrorActionPreference = "Continue"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

. (Join-Path $PSScriptRoot "windows-sites.config.ps1")

$LogDir = Join-Path $ProjectRoot "data\logs"
$LogFile = Join-Path $LogDir "docker-watchdog.log"
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

function Log([string]$Message) {
  $line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $Message"
  Add-Content -Path $LogFile -Value $line -Encoding UTF8
}

$env:Path = @(
  $env:Path,
  "C:\Program Files\nodejs",
  "C:\Program Files\Docker\Docker\resources\bin",
  "$env:APPDATA\npm",
  "C:\Program Files\Tailscale"
) -join ";"

function Test-HttpOk([string]$Uri, [int]$TimeoutSec = 5) {
  try {
    $out = & curl.exe -s -o NUL -w "%{http_code}" --connect-timeout 3 --max-time $TimeoutSec $Uri 2>$null
    if ($LASTEXITCODE -ne 0) { return $false }
    $code = ("$out").Trim()
    return @("200", "204", "301", "302", "307", "308") -contains $code
  } catch {
    return $false
  }
}

function Get-Pm2ListeningPort([string]$Name) {
  try {
    $show = & pm2 show $Name 2>$null | Out-String
    if ($show -match '(?im)PORT\s*[│|:]\s*(\d{2,5})') { return [int]$Matches[1] }
    if ($show -match '(?im)\bport\b\s*[:=]\s*(\d{2,5})') { return [int]$Matches[1] }
    if ($show -match '(?im)--port[=\s]+(\d{2,5})') { return [int]$Matches[1] }
    if ($show -match '(?im)localhost:(\d{2,5})') { return [int]$Matches[1] }
    if ($show -match '(?im)0\.0\.0\.0:(\d{2,5})') { return [int]$Matches[1] }
  } catch {}
  return $null
}

function Repair-Pm2App([string]$Name, [string]$Root, [string]$Ecosystem) {
  if (-not $Name) { return }
  & pm2 describe $Name 1>$null 2>$null
  if ($LASTEXITCODE -eq 0) {
    & pm2 restart $Name --update-env *>> $LogFile
  } elseif ($Root -and $Ecosystem -and (Test-Path (Join-Path $Root $Ecosystem))) {
    Push-Location $Root
    & pm2 start (Join-Path $Root $Ecosystem) *>> $LogFile
    Pop-Location
  } else {
    & pm2 resurrect *>> $LogFile
  }
  & pm2 save *>> $LogFile
}

function Test-SiteHealth([string]$Name, [int]$ConfiguredPort, [string]$HealthPath) {
  if (-not $HealthPath) { $HealthPath = "/" }
  $ports = @()
  if ($ConfiguredPort -gt 0) { $ports += $ConfiguredPort }
  $detected = Get-Pm2ListeningPort $Name
  if ($detected -and ($ports -notcontains $detected)) { $ports += $detected }
  foreach ($p in @(3001, 3002, 3003, 3080, 4000, 5000, 5173, 8080)) {
    if ($ports -notcontains $p) { $ports += $p }
  }

  foreach ($port in $ports) {
    $uri = "http://127.0.0.1:$port$HealthPath"
    if (Test-HttpOk $uri 4) {
      return @{ Ok = $true; Port = $port; Uri = $uri }
    }
    # also try without trailing path quirks
    if ($HealthPath -ne "/" -and (Test-HttpOk "http://127.0.0.1:$port/" 3)) {
      return @{ Ok = $true; Port = $port; Uri = "http://127.0.0.1:$port/" }
    }
  }
  return @{ Ok = $false; Port = $ConfiguredPort; Uri = "http://127.0.0.1:$ConfiguredPort$HealthPath" }
}

Log "watchdog check (multi-site)"

# Docker
try {
  docker info 1>$null 2>$null
  if ($LASTEXITCODE -ne 0) {
    Log "Docker down - skip"
    exit 1
  }
} catch {
  Log "Docker unavailable"
  exit 1
}

# Supabase
if ($Global:YaoshengHostConfig.EnsureSupabase) {
  $supaUrl = [string]$Global:YaoshengHostConfig.SupabaseHealthUrl
  if (-not (Test-HttpOk $supaUrl 8)) {
    Log "Supabase unhealthy -> supabase start"
    & supabase start *>> $LogFile
    Start-Sleep -Seconds 15
  }
}

$allOk = $true

foreach ($site in $Global:YaoshengSites) {
  $name = [string]$site.Name
  $port = [int]$site.Port
  $root = [string]$site.Root
  $health = [string]$site.HealthPath
  if (-not $name) { continue }
  if ($root -and -not (Test-Path $root)) {
    Log "skip $name (root missing)"
    continue
  }

  $result = Test-SiteHealth $name $port $health
  if (-not $result.Ok) {
    Log "DOWN $name ($($result.Uri)) -> repair"
    Repair-Pm2App $name $root ([string]$site.Ecosystem)
    Start-Sleep -Seconds 8
    $result = Test-SiteHealth $name $port $health
  }

  if ($result.Ok) {
    Log "OK $name :$($result.Port)"
    if ($port -gt 0 -and $result.Port -ne $port) {
      Log "NOTE $name configured Port=$port but healthy on $($result.Port). Update windows-sites.config.ps1"
    }
  } else {
    Log "FAIL $name (tried configured + detected ports)"
    $allOk = $false
  }
}

# Keep every pm2 app online (avoid jlist JSON duplicate-key crash on Windows)
if ($Global:YaoshengHostConfig.WatchAllPm2) {
  try {
    $table = & pm2 list --no-color 2>$null | Out-String
    $lines = $table -split "`r?`n"
    foreach ($line in $lines) {
      if ($line -notmatch 'errored|stopped') { continue }
      if ($line -notmatch '\|\s*\d+\s*\|\s*([^\|]+?)\s*\|') { continue }
      $name = $Matches[1].Trim()
      if (-not $name -or $name -eq "name") { continue }
      Log "pm2 $name not online -> restart"
      & pm2 restart $name --update-env *>> $LogFile
      $allOk = $false
    }
    & pm2 save *>> $LogFile
  } catch {
    Log "pm2 list parse skip: $($_.Exception.Message)"
  }
}

# Funnel: primary + secondary HTTPS ports (must stay on `funnel`, not `serve`)
$funnelPort = [int]$Global:YaoshengHostConfig.PrimaryFunnelPort
$funnelStatus = (& tailscale funnel status 2>&1 | Out-String)
if ($funnelStatus -notmatch "Funnel on" -or $funnelStatus -notmatch "127\.0\.0\.1:$funnelPort") {
  Log "Funnel primary down -> funnel --bg $funnelPort"
  & tailscale funnel --bg --yes $funnelPort *>> $LogFile
  $funnelStatus = (& tailscale funnel status 2>&1 | Out-String)
  if ($funnelStatus -match "Funnel on" -and $funnelStatus -match "127\.0\.0\.1:$funnelPort") {
    Log "OK Funnel primary :443 -> 127.0.0.1:$funnelPort (repaired)"
  } else {
    Log "FAIL Funnel primary still missing after repair"
    $allOk = $false
  }
} else {
  Log "OK Funnel primary :443 -> 127.0.0.1:$funnelPort"
}

foreach ($site in $Global:YaoshengSites) {
  $port = [int]$site.Port
  $httpsPort = 0
  if ($site.ContainsKey("FunnelHttpsPort") -and $site.FunnelHttpsPort) {
    $httpsPort = [int]$site.FunnelHttpsPort
  }
  if ($httpsPort -le 0) { continue }
  if ($port -eq $funnelPort) { continue }
  if (-not (Test-Path ([string]$site.Root))) { continue }

  # Expect both the HTTPS listen port and local proxy target in status
  $hasHttps = $funnelStatus -match [regex]::Escape(":$httpsPort")
  $hasProxy = $funnelStatus -match "127\.0\.0\.1:$port"
  if (-not $hasHttps -or -not $hasProxy) {
    Log "Funnel $($site.Name) down -> funnel --bg --https=$httpsPort $port"
    & tailscale funnel --bg --yes --https=$httpsPort $port *>> $LogFile
    $funnelStatus = (& tailscale funnel status 2>&1 | Out-String)
    $hasHttps = $funnelStatus -match [regex]::Escape(":$httpsPort")
    $hasProxy = $funnelStatus -match "127\.0\.0\.1:$port"
    if ($hasHttps -and $hasProxy) {
      Log "OK Funnel $($site.Name) :$httpsPort -> 127.0.0.1:$port (repaired)"
    } else {
      Log "FAIL Funnel $($site.Name) :$httpsPort still missing after repair"
      $allOk = $false
    }
  } else {
    Log "OK Funnel $($site.Name) :$httpsPort -> 127.0.0.1:$port"
  }
}

if ($allOk) {
  Log "OK all configured sites"
  exit 0
}

Log "FAIL one or more sites"
exit 1
