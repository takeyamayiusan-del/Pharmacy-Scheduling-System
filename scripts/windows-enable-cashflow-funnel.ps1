# One-shot: expose cashflow (5000) on Funnel HTTPS 8443 without resetting pharmacy Funnel.
#   powershell -ExecutionPolicy Bypass -File scripts\windows-enable-cashflow-funnel.ps1

$ErrorActionPreference = "Continue"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot "windows-sites.config.ps1")

$env:Path = @(
  $env:Path,
  "C:\Program Files\Tailscale"
) -join ";"

$site = $Global:YaoshengSites | Where-Object { $_.Name -eq "cashflow" } | Select-Object -First 1
if (-not $site) { throw "cashflow not found in windows-sites.config.ps1" }

$port = [int]$site.Port
$httpsPort = [int]$site.FunnelHttpsPort
if ($httpsPort -le 0) { $httpsPort = 8443 }

Write-Host "=== Enable cashflow Funnel ===" -ForegroundColor Cyan
Write-Host "Local:  http://127.0.0.1:$port"
Write-Host "Public: https://<your-host>.ts.net:$httpsPort/"

$listenOk = [bool](netstat -ano | Select-String ":$port\s" | Select-String "LISTENING")
if (-not $listenOk) {
  Write-Host "WARN: port $port not listening. Start cashflow first (pm2 start / START-NOW.bat)." -ForegroundColor Yellow
}

# Do NOT run serve/funnel reset here — keep pharmacy on 443.
& tailscale funnel --bg --yes --https=$httpsPort $port
Write-Host ""
& tailscale funnel status
Write-Host ""
Write-Host "Done. Test on phone 4G: https://chiaho-pharmacy.tail7f62d0.ts.net:$httpsPort/" -ForegroundColor Green
