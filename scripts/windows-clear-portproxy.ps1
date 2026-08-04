# 清除舊 Hyper-V 留下的 54321 portproxy（會擋本機 Docker Supabase）
# 請以系統管理員執行：
#   powershell -ExecutionPolicy Bypass -File scripts\windows-clear-portproxy.ps1

$ErrorActionPreference = "Continue"

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator
)
if (-not $isAdmin) {
    Write-Host "Requesting Administrator privileges..." -ForegroundColor Yellow
    Start-Process powershell.exe -Verb RunAs -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`""
    exit 0
}

Write-Host "=== Clear Supabase portproxy (54321) ===" -ForegroundColor Cyan
Write-Host "Before:"
netsh interface portproxy show all

netsh interface portproxy delete v4tov4 listenport=54321 listenaddress=0.0.0.0 | Out-Null
netsh interface portproxy delete v4tov4 listenport=54321 listenaddress=127.0.0.1 | Out-Null

Write-Host ""
Write-Host "After (54321 should be gone):" -ForegroundColor Green
netsh interface portproxy show all

Write-Host ""
Write-Host "Testing Auth..."
& curl.exe -s -w "auth health: %{http_code}`n" --connect-timeout 3 --max-time 8 http://127.0.0.1:54321/auth/v1/health
Write-Host ""
Write-Host "If not 200: docker restart supabase_kong_yaosheng-pharmacy supabase_auth_yaosheng-pharmacy"
Write-Host "Then:     pm2 restart pharmacy-web --update-env"
