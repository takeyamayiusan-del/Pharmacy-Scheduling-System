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

function Repair-Pm2App([string]$Name, [string]$Root, [string]$Ecosystem) {
  if (-not $Name) { return }
  & pm2 describe $Name 1>$null 2>$null
  if ($LASTEXITCODE -eq 0) {
    & pm2 restart $Name *>> $LogFile
  } elseif ($Root -and $Ecosystem -and (Test-Path (Join-Path $Root $Ecosystem))) {
    Push-Location $Root
    & pm2 start (Join-Path $Root $Ecosystem) *>> $LogFile
    Pop-Location
  } else {
    & pm2 resurrect *>> $LogFile
  }
  & pm2 save *>> $LogFile
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

# Configured sites
foreach ($site in $Global:YaoshengSites) {
  $name = [string]$site.Name
  $port = [int]$site.Port
  $root = [string]$site.Root
  $health = [string]$site.HealthPath
  if (-not $health) { $health = "/" }
  if (-not $name -or -not $port) { continue }
  if ($root -and -not (Test-Path $root)) {
    Log "skip $name (root missing)"
    continue
  }

  $uri = "http://127.0.0.1:$port$health"
  $ok = Test-HttpOk $uri 5
  if (-not $ok) {
    Log "DOWN $name ($uri) -> repair"
    Repair-Pm2App $name $root ([string]$site.Ecosystem)
    Start-Sleep -Seconds 6
    $ok = Test-HttpOk $uri 5
  }
  if ($ok) { Log "OK $name :$port" } else { Log "FAIL $name :$port"; $allOk = $false }
}

# Also keep every other pm2 app online (both sites together)
if ($Global:YaoshengHostConfig.WatchAllPm2) {
  try {
    $raw = & pm2 jlist 2>$null
    if ($raw) {
      $apps = $raw | ConvertFrom-Json
      foreach ($app in $apps) {
        $status = [string]$app.pm2_env.status
        $name = [string]$app.name
        if (-not $name) { continue }
        if ($status -eq "online") { continue }
        Log "pm2 $name status=$status -> restart"
        & pm2 restart $name *>> $LogFile
        $allOk = $false
      }
      & pm2 save *>> $LogFile
    }
  } catch {
    Log "pm2 jlist parse skip: $($_.Exception.Message)"
  }
}

# Funnel primary
$funnelPort = [int]$Global:YaoshengHostConfig.PrimaryFunnelPort
$funnelStatus = (& tailscale funnel status 2>&1 | Out-String)
if ($funnelStatus -notmatch "Funnel on" -or $funnelStatus -notmatch "127\.0\.0\.1:$funnelPort") {
  Log "Funnel down -> funnel --bg $funnelPort"
  & tailscale funnel --bg $funnelPort *>> $LogFile
}

if ($allOk) {
  Log "OK all configured sites"
  exit 0
}

Log "FAIL one or more sites"
exit 1
