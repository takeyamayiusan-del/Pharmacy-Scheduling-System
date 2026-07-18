# Boot: Docker -> Supabase -> all configured sites (pm2) -> Funnel
$ErrorActionPreference = "Continue"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

. (Join-Path $PSScriptRoot "windows-sites.config.ps1")

$LogDir = Join-Path $ProjectRoot "data\logs"
$LogFile = Join-Path $LogDir "docker-boot.log"
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

function Log([string]$Message) {
  $line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $Message"
  Add-Content -Path $LogFile -Value $line -Encoding UTF8
  Write-Host $line
}

$env:Path = @(
  $env:Path,
  "C:\Program Files\nodejs",
  "C:\Program Files\Docker\Docker\resources\bin",
  "$env:APPDATA\npm",
  "C:\Program Files\Tailscale"
) -join ";"

function Ensure-Pm2Site($site) {
  $name = [string]$site.Name
  $root = [string]$site.Root
  $ecoRel = [string]$site.Ecosystem
  if (-not $name) { return }

  & pm2 describe $name 1>$null 2>$null
  if ($LASTEXITCODE -eq 0) {
    & pm2 restart $name *>> $LogFile
    return
  }

  if ($root -and (Test-Path $root) -and $ecoRel) {
    $eco = Join-Path $root $ecoRel
    if (Test-Path $eco) {
      Log "pm2 start ecosystem for $name"
      Push-Location $root
      & pm2 start $eco *>> $LogFile
      Pop-Location
      return
    }
  }

  Log "WARN: cannot start $name (missing ecosystem/root). Will rely on pm2 resurrect."
}

Log "=== multi-site boot start ==="

# 1) Docker
$dockerOk = $false
for ($i = 1; $i -le 48; $i++) {
  try {
    docker info 1>$null 2>$null
    if ($LASTEXITCODE -eq 0) { $dockerOk = $true; break }
  } catch {}
  Log "waiting Docker... $i/48"
  Start-Sleep -Seconds 5
}
if (-not $dockerOk) {
  Log "ERROR: Docker not ready"
  exit 1
}
Log "Docker ready"

# 2) Supabase
if ($Global:YaoshengHostConfig.EnsureSupabase) {
  Log "supabase start"
  & supabase start *>> $LogFile
  Start-Sleep -Seconds 20
}

# 3) Restore previous pm2 list, then ensure each configured site
Log "pm2 resurrect"
& pm2 resurrect *>> $LogFile
Start-Sleep -Seconds 3

foreach ($site in $Global:YaoshengSites) {
  if (-not (Test-Path ([string]$site.Root))) {
    Log "skip site $($site.Name): root not found $($site.Root)"
    continue
  }
  Log "ensure site $($site.Name) :$($site.Port)"
  Ensure-Pm2Site $site
}

& pm2 save *>> $LogFile
Start-Sleep -Seconds 5

# 4) Funnel primary
$funnelPort = [int]$Global:YaoshengHostConfig.PrimaryFunnelPort
Log "tailscale funnel --bg $funnelPort"
& tailscale funnel --bg $funnelPort *>> $LogFile

# Optional: expose other site ports via serve path /site-<port>
foreach ($site in $Global:YaoshengSites) {
  $port = [int]$site.Port
  if ($port -eq $funnelPort) { continue }
  if (-not (Test-Path ([string]$site.Root))) { continue }
  $path = "/site-$port"
  Log "tailscale serve path $path -> 127.0.0.1:$port"
  & tailscale serve --bg --set-path $path $port *>> $LogFile
}

Log "=== multi-site boot done ==="
& pm2 list *>> $LogFile
exit 0
