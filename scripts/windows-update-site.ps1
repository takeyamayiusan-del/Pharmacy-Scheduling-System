# 安全更新排班網站並重新佈署（不會動 portproxy）
# 流程：清殘留 npm → build → 乾淨重啟 pharmacy-web + cashflow（不疊加）
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

Write-Host "=== Safe site update + clean redeploy (no npm stacking) ===" -ForegroundColor Cyan
Write-Host "This will NOT touch Windows portproxy." -ForegroundColor Yellow
Write-Host ""

. (Join-Path $PSScriptRoot "windows-site-common.ps1")
$log = { param($m) Write-Host $m }

[void](Clear-StaleSupabasePortProxy -WriteLog $log)

# 更新前先清：舊 runner、非 PM2 佔埠、PM2 同名重複
Write-Host "Cleaning orphan npm / duplicate PM2 before update..."
Stop-OrphanWebStacks -ProjectRoot $ProjectRoot -Ports @(3000, 8443) -WriteLog $log
[void](Repair-Pm2NameDuplicates -Name "pharmacy-web" -WriteLog $log)
[void](Repair-Pm2NameDuplicates -Name "cashflow" -WriteLog $log)

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
    # build 期間先停排班，避免 .next 與舊 npm start 打架／疊進程
    if (Get-Command pm2 -ErrorAction SilentlyContinue) {
        if (Test-Pm2AppExists -Name "pharmacy-web") {
            Write-Host "pm2 stop pharmacy-web (during build)..."
            pm2 stop pharmacy-web 2>$null | Out-Null
        }
    }

    Write-Host "npm run build ..."
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "npm run build failed" }
}

Write-Host "Clean redeploy: pharmacy-web + cashflow (restart only, no stacking)..."
$ok = Restart-DualSitesClean -ProjectRoot $ProjectRoot -WriteLog $log
if (-not $ok) {
    Write-Host "WARN: one or both apps may not be online - check pm2 status" -ForegroundColor Yellow
    Write-Host "If pharmacy-web missing, run once:" -ForegroundColor Yellow
    Write-Host '  cd C:\Pharmacy-Scheduling-System'
    Write-Host '  cmd /c "pm2 start node_modules\next\dist\bin\next --name pharmacy-web -- start"'
    Write-Host "  pm2 save"
}

Start-Sleep -Seconds 3
Write-Host ""
Write-Host "=== pm2 status (should be 1x each, not stacked) ===" -ForegroundColor Cyan
pm2 status
Write-Host ""
Write-Host -NoNewline "Auth:      "
curl.exe -s -o NUL -w "%{http_code}`n" --connect-timeout 3 --max-time 8 http://127.0.0.1:54321/auth/v1/health
Write-Host -NoNewline "排班 :3000 "
curl.exe -s -o NUL -w "%{http_code}`n" --connect-timeout 3 --max-time 8 http://127.0.0.1:3000/login
Write-Host -NoNewline "金流 :8443 "
curl.exe -s -o NUL -w "%{http_code}`n" --connect-timeout 3 --max-time 8 http://127.0.0.1:8443/

Write-Host ""
Write-Host "Done. Redeployed without npm stacking." -ForegroundColor Green
Write-Host "If Auth is not 200, run as Admin:" -ForegroundColor Yellow
Write-Host "  powershell -ExecutionPolicy Bypass -File scripts\windows-clear-portproxy.ps1"
Write-Host "Then:"
Write-Host "  排班 http://127.0.0.1:3000/login"
Write-Host "  金流 http://127.0.0.1:8443/"
Write-Host "  pm2 status"
Write-Host "  tailscale funnel status"
