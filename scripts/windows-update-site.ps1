# 安全更新網站內容（不會動到 portproxy / Hyper-V）
# 平時只要跑這一行即可：
#   powershell -ExecutionPolicy Bypass -File scripts\windows-update-site.ps1
#
# 流程：拉 main → 停站建置（避免 .next 損壞）→ 清埠 → PM2 重啟 → 健康檢查
#
# 進階（很少用）：
#   powershell -ExecutionPolicy Bypass -File scripts\windows-update-site.ps1 -Branch main
#   powershell -ExecutionPolicy Bypass -File scripts\windows-update-site.ps1 -SkipBuild
#   powershell -ExecutionPolicy Bypass -File scripts\windows-update-site.ps1 -NoPull

param(
    [string]$Branch = "main",
    [switch]$SkipBuild,
    [switch]$NoPull
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

Write-Host "=== Safe site update (Docker + PM2) ===" -ForegroundColor Cyan
Write-Host "This will NOT touch Windows portproxy." -ForegroundColor Yellow
Write-Host ("Primary branch: {0}" -f $Branch) -ForegroundColor Cyan
Write-Host ""

. (Join-Path $PSScriptRoot "windows-site-common.ps1")
$Log = { param($m) Write-Host $m }
[void](Clear-StaleSupabasePortProxy -WriteLog $Log)

if (-not $NoPull) {
    Write-Host "Fetching / checking out: $Branch"
    $prevEap = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        git fetch origin $Branch 2>&1 | ForEach-Object { Write-Host $_ }
        if ($LASTEXITCODE -ne 0) {
            git fetch old-origin $Branch 2>&1 | ForEach-Object { Write-Host $_ }
            if ($LASTEXITCODE -ne 0) { throw "git fetch failed for $Branch" }
        }

        $null = git checkout -B $Branch "origin/$Branch" 2>&1
        if ($LASTEXITCODE -ne 0) {
            $null = git checkout -B $Branch "old-origin/$Branch" 2>&1
        }
        if ($LASTEXITCODE -ne 0) { throw "git checkout failed for $Branch" }

        Write-Host ("Checked out {0} @ {1}" -f $Branch, (git rev-parse --short HEAD))
    }
    finally {
        $ErrorActionPreference = $prevEap
    }
}

if (-not $SkipBuild) {
    Write-Host ""
    Write-Host "Building (stops pharmacy-web first to protect .next) ..." -ForegroundColor Cyan
    Invoke-NpmBuild -ProjectRoot $ProjectRoot
} elseif (-not (Test-PharmacyWebBuildReady -ProjectRoot $ProjectRoot)) {
    throw "SkipBuild requested but .next is incomplete. Run without -SkipBuild."
}

Write-Host ""
Write-Host "Restarting pharmacy-web ..." -ForegroundColor Cyan
$siteOk = Restart-PharmacyWebPm2 -ProjectRoot $ProjectRoot -WriteLog $Log
if (-not $siteOk) {
    Write-Host ""
    Write-Host "Automatic restart failed. Try manual repair:" -ForegroundColor Yellow
    Write-Host "  powershell -ExecutionPolicy Bypass -File scripts\windows-start-pharmacy-web.ps1"
    Write-Host "  node scripts\pm2-pharmacy-web.cjs"
    throw "pharmacy-web failed to start after update"
}

pm2 restart cashflow --update-env 2>$null

Write-Host ""
Write-Host -NoNewline "Auth: "
curl.exe -s -o NUL -w "%{http_code}`n" --connect-timeout 3 --max-time 8 http://127.0.0.1:54321/auth/v1/health
Write-Host -NoNewline "Site: "
curl.exe -s -o NUL -w "%{http_code}`n" --connect-timeout 3 --max-time 8 http://127.0.0.1:3000/login

$pm2Pid = Get-Pm2Pid -Name "pharmacy-web"
$listenPid = Get-PortListenerPid -Port 3000
Write-Host ""
Write-Host ("pm2 pharmacy-web pid : {0}" -f $(if ($pm2Pid) { $pm2Pid } else { "(none)" }))
Write-Host ("port 3000 listener   : {0}" -f $(if ($listenPid) { $listenPid } else { "(none)" }))

Write-Host ""
Write-Host "Done. pharmacy-web owns :3000." -ForegroundColor Green
Write-Host "Browser: Ctrl+F5 hard refresh on /attendance"
Write-Host "If Auth is not 200, run as Admin:"
Write-Host "  powershell -ExecutionPolicy Bypass -File scripts\windows-clear-portproxy.ps1"
