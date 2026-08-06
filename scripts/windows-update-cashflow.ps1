# 更新現金帳（獨立於排班站；不重啟 pharmacy-web）
# Usage:
#   powershell -ExecutionPolicy Bypass -File scripts\windows-update-cashflow.ps1
#   powershell -ExecutionPolicy Bypass -File scripts\windows-update-cashflow.ps1 -SkipPull

param(
    [switch]$SkipPull
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot
. (Join-Path $PSScriptRoot "windows-site-common.ps1")

$configPath = Get-CashflowBootstrapConfigPath -ProjectRoot $ProjectRoot
if (-not (Test-Path -LiteralPath $configPath)) {
    throw @"
cashflow bootstrap missing: $configPath
Register once first:
  powershell -ExecutionPolicy Bypass -File scripts\windows-register-cashflow.ps1 ``
    -ScriptPath "C:\cash-flow-app\backend\index.js" ``
    -Cwd "C:\cash-flow-app" ``
    -Port 5000
"@
}

$cfg = (Get-Content -LiteralPath $configPath -Raw) | ConvertFrom-Json
$cwd = [string]$cfg.cwd
if (-not $cwd -or -not (Test-Path -LiteralPath $cwd)) {
    throw "cashflow cwd not found in bootstrap: $cwd"
}

$port = Get-CashflowHealthPort -ProjectRoot $ProjectRoot
Write-Host "=== Update cashflow only (pharmacy-web untouched) ===" -ForegroundColor Cyan
Write-Host "Cwd:  $cwd"
Write-Host "Port: $port"
Write-Host ""

$WatchdogTaskName = "YaoshengPharmacyWatchdog"
$resumeWatchdog = $false
$tWatch = Get-ScheduledTask -TaskName $WatchdogTaskName -ErrorAction SilentlyContinue
if ($tWatch -and $tWatch.State -ne "Disabled") {
    $resumeWatchdog = $true
    Write-Host "Pausing watchdog during cashflow update ..." -ForegroundColor Yellow
    Stop-ScheduledTask -TaskName $WatchdogTaskName -ErrorAction SilentlyContinue
    Disable-ScheduledTask -TaskName $WatchdogTaskName -ErrorAction SilentlyContinue | Out-Null
}

try {
if (-not $SkipPull) {
    if (Test-Path -LiteralPath (Join-Path $cwd ".git")) {
        Write-Host "git pull in cashflow repo ..." -ForegroundColor Cyan
        Push-Location $cwd
        try {
            git pull --ff-only
            if ($LASTEXITCODE -ne 0) { throw "git pull failed in $cwd" }
        } finally {
            Pop-Location
        }
    } else {
        Write-Host "No .git in $cwd — skip pull, restart only." -ForegroundColor Yellow
    }
}

if (-not (Get-Command pm2 -ErrorAction SilentlyContinue)) {
    throw "pm2 not found"
}

if (-not (Test-Pm2AppExists -Name "cashflow")) {
    if (-not (Ensure-CashflowPm2Registered -ProjectRoot $ProjectRoot)) {
        throw "Failed to register cashflow in PM2"
    }
} else {
    Write-Host "pm2 restart cashflow ..." -ForegroundColor Cyan
    & pm2 restart cashflow --update-env
    if ($LASTEXITCODE -ne 0) { throw "pm2 restart cashflow failed" }
}

Start-Sleep -Seconds 2
& pm2 save 2>$null | Out-Null

Write-Host ""
Write-Host -NoNewline "Cashflow: "
curl.exe -s -o NUL -w "%{http_code}`n" --connect-timeout 3 --max-time 8 "http://127.0.0.1:$port/"
Write-Host -NoNewline "Pharmacy (untouched): "
curl.exe -s -o NUL -w "%{http_code}`n" --connect-timeout 3 --max-time 8 http://127.0.0.1:3000/login

if (-not (Test-CashflowHealthy -ProjectRoot $ProjectRoot)) {
    throw "cashflow unhealthy after update"
}

Write-Host ""
Write-Host "Done. cashflow updated; pharmacy-web was not restarted." -ForegroundColor Green
}
finally {
    if ($resumeWatchdog) {
        Enable-ScheduledTask -TaskName $WatchdogTaskName -ErrorAction SilentlyContinue | Out-Null
        Start-ScheduledTask -TaskName $WatchdogTaskName -ErrorAction SilentlyContinue
        Write-Host "Watchdog re-enabled." -ForegroundColor Green
    }
}