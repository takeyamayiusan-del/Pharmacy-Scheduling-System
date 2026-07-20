# Watchdog every minute: sites + Funnel ensure (idempotent, no reset) + public IPv4 probe
# ASCII-only for Windows PowerShell 5.1
$ErrorActionPreference = "Continue"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

. (Join-Path $PSScriptRoot "windows-sites.config.ps1")
. (Join-Path $PSScriptRoot "windows-funnel-ensure.ps1")

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
  return (Test-YaoshengLocalHttp -Uri $Uri -TimeoutSec $TimeoutSec)
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

  foreach ($port in $ports) {
    $uri = "http://127.0.0.1:$port$HealthPath"
    if (Test-HttpOk $uri 4) {
      return @{ Ok = $true; Port = $port; Uri = $uri }
    }
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
  } else {
    Log "FAIL $name"
    $allOk = $false
  }
}

# Keep every pm2 app online
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

# Funnel: ensure mounts only (idempotent, never reset)
$status = Ensure-YaoshengFunnelMounts -HostConfig $Global:YaoshengHostConfig -Sites $Global:YaoshengSites -Log { param($m) Log $m }
$hostName = Get-YaoshengFunnelHost -StatusText $status
if (-not $hostName) { $hostName = "chiaho-pharmacy.tail7f62d0.ts.net" }

$primaryPort = [int]$Global:YaoshengHostConfig.PrimaryFunnelPort
if (-not (Test-YaoshengFunnelMountConfigured -StatusText $status -LocalPort $primaryPort -HttpsPort 443)) {
  Log "FAIL Funnel primary not configured in tailscale status"
  $allOk = $false
} else {
  Log "OK Funnel primary configured :443 -> 127.0.0.1:$primaryPort"
}

foreach ($site in $Global:YaoshengSites) {
  $httpsPort = 0
  if ($site.ContainsKey("FunnelHttpsPort") -and $site.FunnelHttpsPort) {
    $httpsPort = [int]$site.FunnelHttpsPort
  }
  if ($httpsPort -le 0) { continue }
  $port = [int]$site.Port
  if (Test-YaoshengFunnelMountConfigured -StatusText $status -LocalPort $port -HttpsPort $httpsPort) {
    Log "OK Funnel $($site.Name) configured :$httpsPort -> 127.0.0.1:$port"
  } else {
    Log "FAIL Funnel $($site.Name) not configured"
    $allOk = $false
  }
}

# Public IPv4 probe is advisory only (host often false-fails; do not re-funnel)
$primaryPub = Test-YaoshengPublicFunnelIpv4 -HostName $hostName -HttpsPort 443 -Path "/login" -TimeoutSec 15
if ($primaryPub) {
  Log "OK public IPv4 probe https://$hostName/login"
} else {
  Log "NOTE public IPv4 probe skipped/failed on host (use phone 4G to verify)"
}

foreach ($site in $Global:YaoshengSites) {
  $httpsPort = 0
  if ($site.ContainsKey("FunnelHttpsPort") -and $site.FunnelHttpsPort) {
    $httpsPort = [int]$site.FunnelHttpsPort
  }
  if ($httpsPort -le 0) { continue }
  $path = [string]$site.HealthPath
  if (-not $path) { $path = "/" }
  $pub = Test-YaoshengPublicFunnelIpv4 -HostName $hostName -HttpsPort $httpsPort -Path $path -TimeoutSec 15
  if ($pub) {
    Log "OK public IPv4 probe https://${hostName}:$httpsPort$path"
  } else {
    Log "NOTE public IPv4 probe $($site.Name) :$httpsPort skipped/failed on host"
  }
}

if ($allOk) {
  Log "OK all configured sites + funnel"
  exit 0
}

Log "FAIL one or more checks"
exit 1
