# Update pharmacy site code, then simple pm2 restart (you can also start apps manually).
# Monitoring (watchdog) keeps both sites online afterwards.
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

Write-Host "=== Site update (build + pm2 restart) ===" -ForegroundColor Cyan

. (Join-Path $PSScriptRoot "windows-site-common.ps1")
$log = { param($m) Write-Host $m }
[void](Clear-StaleSupabasePortProxy -WriteLog $log)

if ($Branch) {
    Write-Host "Fetching / checking out: $Branch"
    git fetch old-origin $Branch
    if ($LASTEXITCODE -ne 0) { git fetch origin $Branch }
    git checkout -B $Branch "old-origin/$Branch" 2>$null
    if ($LASTEXITCODE -ne 0) { git checkout -B $Branch "origin/$Branch" }
}

if (-not $SkipBuild) {
    Write-Host "npm run build ..."
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "npm run build failed" }
}

# Simple restart like manual pm2 - free ports first to avoid EADDRINUSE
Write-Host "pm2 restart (free ports then start)..."
if (Get-Command pm2 -ErrorAction SilentlyContinue) {
    if (Test-Pm2AppExists -Name "pharmacy-web") { pm2 delete pharmacy-web 2>$null | Out-Null }
    if (Test-Pm2AppExists -Name "cashflow") { pm2 delete cashflow 2>$null | Out-Null }
    Clear-ListeningPorts -Ports @(3000, 5000, 8443) -WriteLog $log

    [void](Start-PharmacyWebPm2Fresh -ProjectRoot $ProjectRoot -WriteLog $log)
    if (Get-CashflowAppRoot) {
        [void](Start-CashflowPm2Fresh -WriteLog $log)
    } else {
        Write-Host "cashflow folder not found - start it manually in C:\cash-flow-app"
    }
    pm2 save 2>$null
}

Start-Sleep -Seconds 3
pm2 status
Write-Host -NoNewline "Auth  : "
curl.exe -s -o NUL -w "%{http_code}`n" --connect-timeout 3 --max-time 8 http://127.0.0.1:54321/auth/v1/health
Write-Host -NoNewline "Site  : "
curl.exe -s -o NUL -w "%{http_code}`n" --connect-timeout 3 --max-time 8 http://127.0.0.1:3000/login
Write-Host -NoNewline "Cash  : "
curl.exe -s -o NUL -w "%{http_code}`n" --connect-timeout 3 --max-time 8 http://127.0.0.1:8443/
Write-Host "Done. Watchdog will keep both online. Cashflow default port is 8443." -ForegroundColor Green
