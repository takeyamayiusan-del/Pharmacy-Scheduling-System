# 離機前全面健康檢查：本機雙站 + PM2 + Funnel 雙入口 + 排程
#   powershell -ExecutionPolicy Bypass -File scripts\windows-health-check.ps1

$ErrorActionPreference = "Continue"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot
. (Join-Path $PSScriptRoot "windows-site-common.ps1")
Import-Pm2Environment -ProjectRoot $ProjectRoot

$fail = 0
function Ok([string]$m) { Write-Host "  OK  $m" -ForegroundColor Green }
function Bad([string]$m) { Write-Host "  FAIL $m" -ForegroundColor Red; $script:fail++ }
function Info([string]$m) { Write-Host "  --  $m" -ForegroundColor DarkGray }

Write-Host "=== Dual-site health check ===" -ForegroundColor Cyan
Write-Host "Project: $ProjectRoot"
Write-Host ""

Write-Host "[1] PM2 apps" -ForegroundColor Cyan
if (-not (Get-Pm2Command)) {
    Bad "pm2 not found"
} else {
    $pharmacyOnline = Get-Pm2Online -Name "pharmacy-web"
    $cashflowOnline = Get-Pm2Online -Name "cashflow"
    if ($pharmacyOnline) { Ok "pharmacy-web online" } else { Bad "pharmacy-web not online" }
    if ($cashflowOnline) { Ok "cashflow online" } else { Bad "cashflow not online (register with windows-register-cashflow.ps1)" }
}

Write-Host ""
Write-Host "[2] Local HTTP" -ForegroundColor Cyan
$cashflowPort = Get-CashflowHealthPort -ProjectRoot $ProjectRoot
if (Test-HttpOk -Uri "http://127.0.0.1:3000/login" -TimeoutSec 8) {
    Ok "pharmacy http://127.0.0.1:3000/login"
} else {
    Bad "pharmacy :3000/login not 200"
}
if (Test-HttpOk -Uri "http://127.0.0.1:$cashflowPort/" -TimeoutSec 8) {
    Ok "cashflow http://127.0.0.1:$cashflowPort/"
} else {
    Bad "cashflow :$cashflowPort/ not healthy"
}

Write-Host ""
Write-Host "[3] Port ownership (no zombie on :3000)" -ForegroundColor Cyan
if (Test-PharmacyWebPm2OwningPort) {
    Ok "PM2 pharmacy-web owns :3000 (wrapper/child tree OK)"
} else {
    Bad "PM2 does not own :3000 — risk of EADDRINUSE restart loop"
    $pm2Pid = Get-Pm2Pid -Name "pharmacy-web"
    $listenPid = Get-PortListenerPid -Port 3000
    Info ("pm2 pid={0} listen pid={1}" -f $(if ($pm2Pid) { $pm2Pid } else { "?" }), $(if ($listenPid) { $listenPid } else { "?" }))
}

Write-Host ""
Write-Host "[4] Cashflow bootstrap (for auto-recover)" -ForegroundColor Cyan
$bootPath = Get-CashflowBootstrapConfigPath -ProjectRoot $ProjectRoot
if (Test-Path -LiteralPath $bootPath) {
    Ok "bootstrap exists: $bootPath"
    try {
        $cfg = (Get-Content -LiteralPath $bootPath -Raw) | ConvertFrom-Json
        Info ("script={0} cwd={1} port={2}" -f $cfg.script, $cfg.cwd, $(if ($cfg.port) { $cfg.port } else { 5000 }))
    } catch {
        Bad "bootstrap JSON invalid"
    }
} else {
    Bad "missing data\ops\cashflow-bootstrap.json — watchdog cannot re-register cashflow after wipe"
}

Write-Host ""
Write-Host "[5] Tailscale Funnel dual routes" -ForegroundColor Cyan
$tsState = Get-TailscaleBackendState
Info ("tailscale BackendState=$tsState")
if ($tsState -eq "missing") {
    Bad "tailscale.exe not found"
} elseif ($tsState -ne "Running" -and $tsState -ne "unknown") {
    Bad "Tailscale not Running ($tsState) — connect it in the Tailscale tray, then re-run funnel setup"
}
$phOk = (Test-FunnelProxyConfigured -LocalPort 3000 -PublicHttpsPort 443) -or (Test-FunnelProxyConfigured -LocalPort 3000)
$cfOk = (Test-FunnelProxyConfigured -LocalPort $cashflowPort -PublicHttpsPort 8443) -or (Test-FunnelProxyConfigured -LocalPort $cashflowPort)
if ($phOk) { Ok "funnel 443 → 3000" } else { Bad "funnel missing pharmacy (443→3000)" }
if ($cfOk) { Ok "funnel 8443 → $cashflowPort" } else { Bad "funnel missing cashflow (8443→$cashflowPort) — old watchdog may have wiped it" }

$publicUrl = (Get-FunnelPublicBaseUrl) + "/login"
if (Test-FunnelPublicOk) {
    Ok "public $publicUrl"
} else {
    if ($phOk -and $cfOk) {
        Info "public probe failed: $publicUrl"
        Info "Funnel routes are still configured. Same-PC public probe is often a false alarm;"
        Info "do not funnel reset while people are using it. If phone 4G really cannot open it:"
        Info "  powershell -ExecutionPolicy Bypass -File scripts\windows-restore-funnel.ps1"
    } else {
        Bad "public URL not reachable: $publicUrl"
        Info "Local HTTP can be OK while Funnel is down. Restore with:"
        Info "  powershell -ExecutionPolicy Bypass -File scripts\windows-restore-funnel.ps1"
    }
}
Info "Verify :8443 with a phone on 4G (not store Wi-Fi)"

Write-Host ""
Write-Host "[6] Scheduled tasks (boot + watchdog)" -ForegroundColor Cyan
foreach ($name in @("YaoshengPharmacyStart", "YaoshengPharmacyWatchdog")) {
    $t = Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue
    if (-not $t) {
        Bad "$name not registered"
        continue
    }
    if ($t.State -eq "Disabled") {
        Bad "$name is Disabled — enable after new scripts are deployed"
    } else {
        Ok ("{0} state={1}" -f $name, $t.State)
    }
    if ($name -eq "YaoshengPharmacyWatchdog") {
        $principalUser = [string]$t.Principal.UserId
        if ($principalUser -match 'SYSTEM|S-1-5-18') {
            Bad "watchdog runs as SYSTEM — pm2 missing in that session; Funnel will not auto-restore"
            Info "  powershell -ExecutionPolicy Bypass -File scripts\windows-register-keepalive-simple.ps1"
        } else {
            Info ("runs as {0} ({1})" -f $principalUser, $t.Principal.LogonType)
        }
        $info = Get-ScheduledTaskInfo -TaskName $name -ErrorAction SilentlyContinue
        if ($info -and $info.LastRunTime) {
            Info ("last run: {0}  last result: {1}" -f $info.LastRunTime, $info.LastTaskResult)
            $ageMin = [int]((Get-Date) - $info.LastRunTime).TotalMinutes
            if ($ageMin -gt 5) {
                Bad "watchdog last run was $ageMin min ago — likely stopped after reboot; re-register:"
                Info "  powershell -ExecutionPolicy Bypass -File scripts\windows-register-keepalive-simple.ps1"
            }
            if ($info.LastTaskResult -eq 1) {
                if ($principalUser -match 'SYSTEM|S-1-5-18') {
                    Bad "watchdog last result=1 — SYSTEM cannot see pm2; re-register keepalive"
                } else {
                    Info "watchdog last result=1 — see data\logs\keepalive-simple.log"
                }
            }
        }
        $hasBoot = $false
        $hasDaily = $false
        foreach ($tr in @($t.Triggers)) {
            $cdata = $tr.CimClass.CimClassName
            if ("$cdata" -match "Boot|Logon") { $hasBoot = $true }
            if ("$cdata" -match "Daily|Calendar") { $hasDaily = $true }
            if ($tr.Repetition -and $tr.Repetition.Interval) { $hasDaily = $true }
        }
        if (-not $hasBoot) {
            Bad "watchdog missing AtStartup/AtLogon — will not wake after reboot"
        }
    }
}

Write-Host ""
Write-Host "[7] Auth (optional but needed for pharmacy login)" -ForegroundColor Cyan
if (Test-HttpOk -Uri "http://127.0.0.1:54321/auth/v1/health" -TimeoutSec 5) {
    Ok "Supabase Auth :54321"
} else {
    Bad "Auth :54321 unhealthy — login may fail until Docker/supabase is up"
}

Write-Host ""
if ($fail -eq 0) {
    Write-Host "ALL CHECKS PASSED. Safe to leave." -ForegroundColor Green
    Write-Host "Updates:" -ForegroundColor Yellow
    Write-Host "  pharmacy:  powershell -ExecutionPolicy Bypass -File scripts\windows-update-site.ps1"
    Write-Host "  cashflow:  powershell -ExecutionPolicy Bypass -File scripts\windows-update-cashflow.ps1"
    exit 0
}

Write-Host ("FAILED checks: {0}" -f $fail) -ForegroundColor Red
Write-Host "Fix with:" -ForegroundColor Yellow
Write-Host "  powershell -ExecutionPolicy Bypass -File scripts\windows-restore-funnel.ps1"
Write-Host "  powershell -ExecutionPolicy Bypass -File scripts\windows-register-keepalive-simple.ps1"
Write-Host "  powershell -ExecutionPolicy Bypass -File scripts\windows-tailscale-funnel-setup.ps1"
exit 1
