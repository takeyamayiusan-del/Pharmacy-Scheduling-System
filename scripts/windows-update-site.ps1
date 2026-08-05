# 安全更新網站內容（不會動到 portproxy / Hyper-V）
# 平時放著不管沒問題；只有「更新程式」時才需要跑這個。
#
#   powershell -ExecutionPolicy Bypass -File scripts\windows-update-site.ps1
#   powershell -ExecutionPolicy Bypass -File scripts\windows-update-site.ps1 -Branch cursor/stable-774b
#   powershell -ExecutionPolicy Bypass -File scripts\windows-update-site.ps1 -SkipBuild

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
$Log = { param($m) Write-Host $m }
[void](Clear-StaleSupabasePortProxy -WriteLog $Log)

if ($Branch) {
    Write-Host "Fetching / checking out: $Branch"
    git fetch origin $Branch
    if ($LASTEXITCODE -ne 0) {
        git fetch old-origin $Branch
    }
    git checkout -B $Branch "origin/$Branch" 2>$null
    if ($LASTEXITCODE -ne 0) {
        git checkout -B $Branch "old-origin/$Branch"
    }
}

if (-not $SkipBuild) {
    Write-Host "npm run build ..."
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "npm run build failed" }
}

# 關鍵：Windows 上 pm2 restart 常殺不掉舊 Next，留下佔 :3000 的殭屍站。
# 正確順序 = 先停 PM2 → 強制清埠 → 再啟動，並確認 PID 一致。
Write-Host ""
Write-Host "Restarting pharmacy-web safely (stop → clear :3000 → start) ..." -ForegroundColor Cyan
pm2 stop pharmacy-web 2>$null | Out-Null
Start-Sleep -Seconds 1

# 反覆清到 :3000 沒有 LISTENING（最多 5 輪，避免 watchdog 又拉起舊 process）
for ($i = 1; $i -le 5; $i++) {
    $listenerPid = Get-PortListenerPid -Port 3000
    if (-not $listenerPid) { break }
    Write-Host ("[{0}/5] Port 3000 still held by pid={1}, killing..." -f $i, $listenerPid)
    [void](Stop-PortListenerForce -Port 3000 -WriteLog $Log)
    Start-Sleep -Seconds 1
}

if (Test-PortListening 3000) {
    throw "Port 3000 still occupied after cleanup. Run as Admin and kill the LISTENING pid, then retry."
}

pm2 start pharmacy-web --update-env
if ($LASTEXITCODE -ne 0) {
    pm2 restart pharmacy-web --update-env
}
pm2 restart cashflow --update-env 2>$null

Start-Sleep -Seconds 3

$pm2Pid = Get-Pm2Pid -Name "pharmacy-web"
$listenPid = Get-PortListenerPid -Port 3000
Write-Host ""
Write-Host ("pm2 pharmacy-web pid : {0}" -f $(if ($pm2Pid) { $pm2Pid } else { "(none)" }))
Write-Host ("port 3000 listener   : {0}" -f $(if ($listenPid) { $listenPid } else { "(none)" }))

if (-not (Get-Pm2Online -Name "pharmacy-web")) {
    throw "pharmacy-web is not online. Check: pm2 logs pharmacy-web --lines 30"
}
if (-not $listenPid) {
    throw "Nothing listening on :3000 after start."
}
if ($pm2Pid -and ($listenPid -ne $pm2Pid)) {
    Write-Host "WARNING: :3000 is NOT the PM2 process (zombie risk). Cleaning and retrying once..." -ForegroundColor Yellow
    pm2 stop pharmacy-web 2>$null | Out-Null
    [void](Stop-PortListenerForce -Port 3000 -WriteLog $Log)
    Start-Sleep -Seconds 1
    pm2 start pharmacy-web --update-env
    Start-Sleep -Seconds 3
    $pm2Pid = Get-Pm2Pid -Name "pharmacy-web"
    $listenPid = Get-PortListenerPid -Port 3000
    Write-Host ("retry pm2 pid={0} listen pid={1}" -f $pm2Pid, $listenPid)
    if (-not $pm2Pid -or -not $listenPid -or ($pm2Pid -ne $listenPid)) {
        throw "Port 3000 still not owned by pharmacy-web. Another program keeps respawning on :3000."
    }
}

Write-Host ""
Write-Host -NoNewline "Auth: "
curl.exe -s -o NUL -w "%{http_code}`n" --connect-timeout 3 --max-time 8 http://127.0.0.1:54321/auth/v1/health
Write-Host -NoNewline "Site: "
curl.exe -s -o NUL -w "%{http_code}`n" --connect-timeout 3 --max-time 8 http://127.0.0.1:3000/login

Write-Host ""
Write-Host "Done. pharmacy-web owns :3000." -ForegroundColor Green
Write-Host "If Auth is not 200, run as Admin:" -ForegroundColor Yellow
Write-Host "  powershell -ExecutionPolicy Bypass -File scripts\windows-clear-portproxy.ps1"
Write-Host "Then login at http://127.0.0.1:3000/login or Funnel URL."
Write-Host "Browser: Ctrl+F5 hard refresh."
