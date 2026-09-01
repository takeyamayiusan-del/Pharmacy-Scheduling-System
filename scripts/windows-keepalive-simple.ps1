# 簡單雙站保活：本機網站真的掛了才重開；外網由 funnel-public-monitor 常駐監測（15 秒）。
# 本腳本仍會檢查外網作為備援，並確保 monitor 程序存活。外網不通：重宣告 → reset。
#
# 這支是「檢查一次就結束」，不是常駐程式。排程每分鐘會再跑。
# 手動測一次（會印結果；細節在 data\logs\keepalive-simple.log）：
#   powershell -ExecutionPolicy Bypass -File scripts\windows-keepalive-simple.ps1
# 外網現在不通（立刻重宣告）：
#   powershell -ExecutionPolicy Bypass -File scripts\windows-restore-funnel.ps1
# 完整檢查：
#   powershell -ExecutionPolicy Bypass -File scripts\windows-health-check.ps1

$ErrorActionPreference = "Continue"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot "windows-site-common.ps1")
Import-Pm2Environment -ProjectRoot $ProjectRoot
$LogDir = Join-Path $ProjectRoot "data\logs"
$LogFile = Join-Path $LogDir "keepalive-simple.log"
$CashflowScript = "C:\cash-flow-app\backend\index.js"
$CashflowCwd = "C:\cash-flow-app"

function Write-Log([string]$Message) {
    if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir -Force | Out-Null }
    Add-Content -Path $LogFile -Value "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $Message" -Encoding UTF8
}

function Write-StatusLine([string]$Label, [bool]$Ok) {
    $text = if ($Ok) { "OK" } else { "FAIL" }
    $color = if ($Ok) { "Green" } else { "Red" }
    Write-Host ("  {0,-22} {1}" -f $Label, $text) -ForegroundColor $color
}

function Test-LocalOk([string]$Uri) {
    try {
        $code = & curl.exe -s -o NUL -w "%{http_code}" --connect-timeout 3 --max-time 8 $Uri
        return ($code -eq "200" -or $code -eq "304")
    } catch {
        return $false
    }
}

function Test-PharmacyLocalOk {
    if (Test-LocalOk "http://127.0.0.1:3000/api/health") { return $true }
    return (Test-LocalOk "http://127.0.0.1:3000/login")
}


Write-Log "keepalive start"
Write-Host "=== Keepalive (one check, then exit) ===" -ForegroundColor Cyan
Write-Host "Not a resident process. Task Scheduler runs this every minute."
Write-Host "External Funnel: resident monitor every 15s (YaoshengPharmacyFunnelMonitor)."
Write-Host "Log: $LogFile"
Write-Host ""
$healthState = Read-KeepaliveHealthState -ProjectRoot $ProjectRoot

$pm2 = Get-Pm2Command
if (-not $pm2) {
    Write-Log "pm2 missing (PATH=$env:Path PM2_HOME=$env:PM2_HOME) — still restoring Funnel"
}

# --- pharmacy :3000 ---
# 埠還在聽就不要因單次 /login 逾時重啟（匯出 PDF、尖峰載入會讓 8 秒探測失敗，重啟會把正在用的人踢掉）
$pharmacyOk = Test-PharmacyLocalOk
$pharmacyListen = Test-PortListening 3000
if ($pharmacyOk) {
    $healthState.pharmacyHttpFails = 0
} elseif ($pharmacyListen) {
    $healthState.pharmacyHttpFails = [int]$healthState.pharmacyHttpFails + 1
    Write-Log "pharmacy HTTP miss but :3000 listening (fails=$($healthState.pharmacyHttpFails)/3) — skip restart"
    $pharmacyOk = $true
    if ($pm2 -and [int]$healthState.pharmacyHttpFails -ge 3) {
        Write-Log "pharmacy HTTP miss x3 — restart on PORT=3000"
        $env:PORT = "3000"
        if (Test-Pm2AppExists -Name "pharmacy-web") {
            & $pm2 restart pharmacy-web --update-env 2>$null | Out-Null
        }
        Start-Sleep -Seconds 4
        $pharmacyOk = Test-PharmacyLocalOk
        $healthState.pharmacyHttpFails = 0
        Write-Log ("pharmacy after repair: " + $(if ($pharmacyOk) { "OK" } else { "FAIL" }))
    }
} elseif ($pm2) {
    Write-Log "pharmacy down (port closed) — restart on PORT=3000"
    $env:PORT = "3000"
    if (Test-Pm2AppExists -Name "pharmacy-web") {
        & $pm2 restart pharmacy-web --update-env 2>$null | Out-Null
    } else {
        $eco = Join-Path $ProjectRoot "ecosystem.config.cjs"
        if (Test-Path -LiteralPath $eco) {
            & $pm2 start $eco --only pharmacy-web --update-env 2>$null | Out-Null
        }
    }
    Start-Sleep -Seconds 4
    $pharmacyOk = Test-PharmacyLocalOk
    $healthState.pharmacyHttpFails = 0
    Write-Log ("pharmacy after repair: " + $(if ($pharmacyOk) { "OK" } else { "FAIL" }))
}

# HTTP 正常但非 PM2 程序（常見：手動 node 啟動）→ 收編到 PM2，否則自動重啟無效
if ($pharmacyOk -and $pm2 -and -not (Test-PharmacyWebPm2OwningPort)) {
    Write-Log "pharmacy HTTP OK but PM2 does not own :3000 — adopt via Repair-SiteIfNeeded"
    if (Repair-SiteIfNeeded -ProjectRoot $ProjectRoot -WriteLog { param($m) Write-Log $m }) {
        $pharmacyOk = Test-PharmacyLocalOk
    }
    Write-Log ("pharmacy after PM2 adopt: " + $(if ($pharmacyOk) { "OK" } else { "FAIL" }))
}

# --- cashflow :5000（必須與排班分開設 PORT）---
$cashflowOk = Test-LocalOk "http://127.0.0.1:5000/"
$cashflowListen = Test-PortListening 5000
if ($cashflowOk) {
    $healthState.cashflowHttpFails = 0
} elseif ($cashflowListen) {
    $healthState.cashflowHttpFails = [int]$healthState.cashflowHttpFails + 1
    Write-Log "cashflow HTTP miss but :5000 listening (fails=$($healthState.cashflowHttpFails)/3) — skip restart"
    $cashflowOk = $true
    if ($pm2 -and [int]$healthState.cashflowHttpFails -ge 3) {
        Write-Log "cashflow HTTP miss x3 — restart on PORT=5000"
        $env:PORT = "5000"
        if (Test-Pm2AppExists -Name "cashflow") {
            & $pm2 restart cashflow --update-env 2>$null | Out-Null
        }
        Start-Sleep -Seconds 3
        $cashflowOk = Test-LocalOk "http://127.0.0.1:5000/"
        $healthState.cashflowHttpFails = 0
        Write-Log ("cashflow after repair: " + $(if ($cashflowOk) { "OK" } else { "FAIL" }))
    }
} elseif ($pm2) {
    Write-Log "cashflow down (port closed) — restart on PORT=5000"
    $env:PORT = "5000"
    if (Test-Pm2AppExists -Name "cashflow") {
        & $pm2 restart cashflow --update-env 2>$null | Out-Null
    } elseif (Test-Path -LiteralPath $CashflowScript) {
        & $pm2 delete cashflow 2>$null | Out-Null
        & $pm2 start $CashflowScript --name cashflow --cwd $CashflowCwd --update-env 2>$null | Out-Null
    }
    Start-Sleep -Seconds 3
    $cashflowOk = Test-LocalOk "http://127.0.0.1:5000/"
    $healthState.cashflowHttpFails = 0
    Write-Log ("cashflow after repair: " + $(if ($cashflowOk) { "OK" } else { "FAIL" }))
}

$cashflowPort = Get-CashflowHealthPort -ProjectRoot $ProjectRoot
if ($cashflowOk -and $pm2 -and -not (Get-Pm2Online -Name "cashflow")) {
    Write-Log "cashflow HTTP OK but PM2 cashflow not online — adopt"
    $cfListenPid = Get-PortListenerPid -Port $cashflowPort
    if ($cfListenPid) {
        Write-Log ("cashflow orphan pid=$cfListenPid on :$cashflowPort — clearing")
        [void](Stop-PortListenerForce -Port $cashflowPort -WriteLog { param($m) Write-Log $m })
    }
    if (Repair-Pm2AppIfNeeded -Name "cashflow" -ProjectRoot $ProjectRoot -HealthyCheck {
        Test-CashflowHealthy -ProjectRoot $ProjectRoot
    } -WriteLog { param($m) Write-Log $m }) {
        $cashflowOk = Test-LocalOk "http://127.0.0.1:$cashflowPort/"
    }
    Write-Log ("cashflow after PM2 adopt: " + $(if ($cashflowOk) { "OK" } else { "FAIL" }))
}

# --- 確保外網 monitor 常駐程序在跑（status 過期也會重啟）---
[void](Ensure-FunnelMonitorRunning -ProjectRoot $ProjectRoot -WriteLog { param($m) Write-Log $m })

# --- funnel：外網 DOWN 時強制修復（略過冷卻）---
$publicProbeNow = Test-FunnelPublicOk -NoRetry
$forceFunnel = -not $publicProbeNow
if ($forceFunnel) {
    Write-Log "public URL probe FAIL — escalating funnel repair (force reapply)"
}
$funnelPublic = Repair-FunnelIfNeeded `
    -WriteLog { param($m) Write-Log $m } `
    -LocalOk $pharmacyOk `
    -ProjectRoot $ProjectRoot `
    -AllowReset `
    -CooldownMinutes 1 `
    -ResetCooldownMinutes 5 `
    -ForceReapply:$forceFunnel `
    -ForceReset:(Test-FunnelShouldForceReset -ProjectRoot $ProjectRoot -PublicOk $publicProbeNow) `
    -HealthState $healthState

Save-KeepaliveHealthState -ProjectRoot $ProjectRoot -State $healthState
Write-Log "done pharmacyOk=$pharmacyOk cashflowOk=$cashflowOk funnelPublic=$funnelPublic"

if ($pm2) {
    & $pm2 save 2>$null | Out-Null
}

Write-Host ""
Write-Host "Result:" -ForegroundColor Cyan
Write-StatusLine "pharmacy :3000" ([bool]$pharmacyOk)
Write-StatusLine "cashflow :5000" ([bool]$cashflowOk)
Write-StatusLine "funnel public" ([bool]$funnelPublic)
Write-Host ("Log: {0}" -f $LogFile) -ForegroundColor DarkGray

if (-not $funnelPublic) {
    Write-Host ""
    Write-Host "External URL is down. Restore now:" -ForegroundColor Yellow
    Write-Host "  powershell -ExecutionPolicy Bypass -File scripts\windows-restore-funnel.ps1"
}

if ($pharmacyOk -and $funnelPublic) { exit 0 }
exit 1
