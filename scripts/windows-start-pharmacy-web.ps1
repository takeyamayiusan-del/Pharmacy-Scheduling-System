# 正確啟動 pharmacy-web（Windows PM2 不能用 CLI 的 `-- start` 或 `npm -- start`）
# Usage: powershell -ExecutionPolicy Bypass -File scripts\windows-start-pharmacy-web.ps1

param(
    [switch]$SkipPortCleanup
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

. (Join-Path $PSScriptRoot "windows-site-common.ps1")
$Log = { param($m) Write-Host $m }

if (-not (Test-Path (Join-Path $ProjectRoot ".next\BUILD_ID"))) {
    throw "Missing .next build. Run: npm run build"
}

if (-not $SkipPortCleanup) {
    $prevEap = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        pm2 stop pharmacy-web 2>$null | Out-Null
        Start-Sleep -Seconds 1
        for ($i = 1; $i -le 5; $i++) {
            $listenerPid = Get-PortListenerPid -Port 3000
            if (-not $listenerPid) { break }
            Write-Host ("[{0}/5] Clearing :3000 pid={1} ..." -f $i, $listenerPid)
            [void](Stop-PortListenerForce -Port 3000 -WriteLog $Log)
            Start-Sleep -Seconds 2
        }
    } finally {
        $ErrorActionPreference = $prevEap
    }

    if (Test-PortListening 3000) {
        $stuck = Get-PortListenerPid -Port 3000
        throw "Port 3000 still held by pid=$stuck. Run as Administrator: taskkill /F /PID $stuck /T"
    }
}

$nextBin = Join-Path $ProjectRoot "node_modules\next\dist\bin\next"
if (-not (Test-Path -LiteralPath $nextBin)) {
    throw "Next binary not found. Run: npm install"
}

$ecosystem = Join-Path $ProjectRoot "ecosystem.config.cjs"
if (-not (Test-Path -LiteralPath $ecosystem)) {
    throw "Missing ecosystem.config.cjs in project root."
}

pm2 delete pharmacy-web 2>$null | Out-Null
pm2 start $ecosystem --only pharmacy-web
pm2 save

Start-Sleep -Seconds 4

$pm2Pid = Get-Pm2Pid -Name "pharmacy-web"
$listenPid = Get-PortListenerPid -Port 3000
Write-Host ""
Write-Host ("pm2 pharmacy-web pid : {0}" -f $(if ($pm2Pid) { $pm2Pid } else { "(none)" }))
Write-Host ("port 3000 listener   : {0}" -f $(if ($listenPid) { $listenPid } else { "(none)" }))

if (-not (Get-Pm2Online -Name "pharmacy-web")) {
    Write-Host "pharmacy-web failed. Last logs:" -ForegroundColor Red
    pm2 logs pharmacy-web --lines 20 --nostream
    throw "pharmacy-web is not online"
}
if (-not $listenPid -or ($pm2Pid -and $listenPid -ne $pm2Pid)) {
    throw "Port 3000 is not owned by pharmacy-web (zombie risk)."
}

Write-Host ""
Write-Host "pharmacy-web is online on :3000" -ForegroundColor Green
Write-Host "Open http://127.0.0.1:3000/attendance and press Ctrl+F5"
