# 安全更新網站內容（不會動到 portproxy / Hyper-V）
# 平時放著不管沒問題；只有「更新程式」時才需要跑這個。
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

Write-Host "pm2 restart pharmacy-web (+ cashflow if present) ..."
pm2 restart pharmacy-web --update-env
pm2 restart cashflow --update-env 2>$null

Start-Sleep -Seconds 3
Write-Host ""
Write-Host -NoNewline "Auth: "
curl.exe -s -o NUL -w "%{http_code}`n" --connect-timeout 3 --max-time 8 http://127.0.0.1:54321/auth/v1/health
Write-Host -NoNewline "Site: "
curl.exe -s -o NUL -w "%{http_code}`n" --connect-timeout 3 --max-time 8 http://127.0.0.1:3000/login

Write-Host ""
Write-Host "Done. If Auth is not 200, run as Admin:" -ForegroundColor Yellow
Write-Host "  powershell -ExecutionPolicy Bypass -File scripts\windows-clear-portproxy.ps1"
Write-Host "Then login at http://127.0.0.1:3000/login or Funnel URL."
