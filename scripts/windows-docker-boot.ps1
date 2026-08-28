# Docker + PM2 開機啟動（本機 Supabase，不用 Hyper-V）
# 系統管理員可選；一般使用者登入後也可跑：
#   powershell -ExecutionPolicy Bypass -File scripts\windows-docker-boot.ps1

param(
    [switch]$SkipFunnel,
    [int]$DockerWaitSeconds = 45
)

$ErrorActionPreference = "Continue"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

$LogDir = Join-Path $ProjectRoot "data\logs"
$LogFile = Join-Path $LogDir "docker-boot.log"
. (Join-Path $PSScriptRoot "windows-site-common.ps1")
Import-Pm2Environment -ProjectRoot $ProjectRoot

function Write-BootLog([string]$Message) {
    if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir -Force | Out-Null }
    $line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $Message"
    Add-Content -Path $LogFile -Value $line -Encoding UTF8
    Write-Host $line
}

Write-Host "=== Yaosheng Docker + PM2 boot ===" -ForegroundColor Cyan
Write-BootLog "Boot start"

# 清掉舊 Hyper-V portproxy，避免 54321 被轉去不存在的 VM
Clear-StaleSupabasePortProxy -WriteLog { param($m) Write-BootLog $m }

Write-BootLog "Waiting ${DockerWaitSeconds}s for Docker Desktop..."
Start-Sleep -Seconds $DockerWaitSeconds

Write-BootLog "supabase start"
Push-Location $ProjectRoot
try {
    & supabase start *>> $LogFile
} catch {
    Write-BootLog "supabase start error: $($_.Exception.Message)"
}
Pop-Location

$authOk = $false
for ($i = 1; $i -le 30; $i++) {
    if (Test-HttpOk -Uri "http://127.0.0.1:54321/auth/v1/health" -TimeoutSec 5) {
        $authOk = $true
        break
    }
    Write-BootLog "Waiting Auth API ($i/30)..."
    Start-Sleep -Seconds 4
}
if ($authOk) {
    Write-BootLog "Auth API OK"
} else {
    Write-BootLog "WARNING: Auth API not ready (login will fail until supabase is healthy)"
}

if (Get-Pm2Command) {
    Write-BootLog "pm2 resurrect + health repair (auto clear occupied :3000)"
    & pm2 resurrect *>> $LogFile 2>&1
    $siteRepair = Repair-SiteIfNeeded -ProjectRoot $ProjectRoot -WriteLog {
        param($m)
        Write-BootLog $m
    }
    if (-not $siteRepair) {
        Write-BootLog "WARNING: pharmacy-web repair failed during boot"
    }
    if (Test-Pm2AppExists -Name "cashflow" -or (Test-Path -LiteralPath (Get-CashflowBootstrapConfigPath -ProjectRoot $ProjectRoot))) {
        [void](Repair-Pm2AppIfNeeded -Name "cashflow" -ProjectRoot $ProjectRoot -HealthyCheck { Test-CashflowHealthy -ProjectRoot $ProjectRoot } -WriteLog {
            param($m)
            Write-BootLog $m
        })
    }
    & pm2 save *>> $LogFile 2>&1
} else {
    Write-BootLog "pm2 not found, falling back to windows-run-site.ps1"
    Start-SiteRunner -ProjectRoot $ProjectRoot
}

$siteOk = $false
for ($i = 1; $i -le 18; $i++) {
    if (Test-SiteHealthy) {
        $siteOk = $true
        break
    }
    Write-BootLog "Waiting site :3000 ($i/18)..."
    Start-Sleep -Seconds 5
}
if ($siteOk) {
    Write-BootLog "Site OK http://127.0.0.1:3000"
} else {
    Write-BootLog "WARNING: site not healthy on :3000"
}

if (-not $SkipFunnel) {
    if (Get-TailscaleCommand) {
        Write-BootLog "Tailscale Funnel repair (probe public window; no reset unless routes missing)"
        $funnelOk = Repair-FunnelIfNeeded -WriteLog { param($m) Write-BootLog $m } -LocalOk $siteOk -MinPublicFails 1 -AllowReset
        if (-not $funnelOk) {
            $routes = Test-FunnelRoutesConfigured
            if ($routes.Ok) {
                Write-BootLog "Funnel routes present but public window still down — skip reset; keepalive will retry"
            } else {
                Write-BootLog "Funnel routes missing — running full funnel setup"
                & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "windows-tailscale-funnel-setup.ps1") *>> $LogFile
            }
        }
    } else {
        Write-BootLog "tailscale not found, skip Funnel"
    }
}

# 重開機後確保每分鐘監測排程仍為啟用（避免更新中途 Disable 後沒恢復、或 -Once 觸發停掉）
[void](Enable-YaoshengWatchdogTask -WriteLog { param($m) Write-BootLog $m })

Write-BootLog "Boot done"
Write-Host "=== Done ===" -ForegroundColor Green
Write-Host "Local: http://127.0.0.1:3000/login"
Write-Host "Auth:  http://127.0.0.1:54321/auth/v1/health"
Write-Host "Log:   $LogFile"
