# 安全更新排班網站（不會動到 portproxy / Hyper-V）
# 更新後會一起 restart PM2 的 pharmacy-web + cashflow；平時靠 watchdog 雙站常駐。
#
#   powershell -ExecutionPolicy Bypass -File scripts\windows-update-site.ps1
#   powershell -ExecutionPolicy Bypass -File scripts\windows-update-site.ps1 -Branch cursor/xxx-774b

param(
    [string]$Branch = "",
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

Write-Host "=== Safe site update (Docker + PM2) ===" -ForegroundColor Cyan
Write-Host "This will NOT touch Windows portproxy." -ForegroundColor Yellow
Write-Host ""

# 若還留著舊轉埠，先清（需管理員才清得掉；失敗只警告）
. (Join-Path $PSScriptRoot "windows-site-common.ps1")
[void](Clear-StaleSupabasePortProxy -WriteLog { param($m) Write-Host $m })

if ($Branch) {
    Write-Host "Fetching / checking out: $Branch"
    git fetch old-origin $Branch
    if ($LASTEXITCODE -ne 0) {
        git fetch origin $Branch
    }
    git checkout -B $Branch "old-origin/$Branch" 2>$null
    if ($LASTEXITCODE -ne 0) {
        git checkout -B $Branch "origin/$Branch"
    }
}

if (-not $SkipBuild) {
    Write-Host "npm run build ..."
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "npm run build failed" }
}

Write-Host "pm2 restart pharmacy-web + cashflow ..."
pm2 resurrect 2>$null
pm2 restart pharmacy-web --update-env
if ($LASTEXITCODE -ne 0) { throw "pm2 restart pharmacy-web failed" }
pm2 restart cashflow --update-env
if ($LASTEXITCODE -ne 0) {
    Write-Host "WARN: cashflow restart failed or not registered in pm2" -ForegroundColor Yellow
} else {
    Write-Host "cashflow restarted OK"
}
pm2 save 2>$null

Start-Sleep -Seconds 4
Write-Host ""
Write-Host -NoNewline "Auth:      "
curl.exe -s -o NUL -w "%{http_code}`n" --connect-timeout 3 --max-time 8 http://127.0.0.1:54321/auth/v1/health
Write-Host -NoNewline "排班 :3000 "
curl.exe -s -o NUL -w "%{http_code}`n" --connect-timeout 3 --max-time 8 http://127.0.0.1:3000/login
Write-Host -NoNewline "金流 :8443 "
curl.exe -s -o NUL -w "%{http_code}`n" --connect-timeout 3 --max-time 8 http://127.0.0.1:8443/

Write-Host ""
Write-Host "Done. Both apps stay under PM2; watchdog keeps Funnel for :3000 and :8443." -ForegroundColor Green
Write-Host "If Auth is not 200, run as Admin:" -ForegroundColor Yellow
Write-Host "  powershell -ExecutionPolicy Bypass -File scripts\windows-clear-portproxy.ps1"
Write-Host "Then:"
Write-Host "  排班 http://127.0.0.1:3000/login"
Write-Host "  金流 http://127.0.0.1:8443/"
Write-Host "  pm2 status"
Write-Host "  tailscale funnel status"
