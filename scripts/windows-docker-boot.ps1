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

if (Get-Command pm2 -ErrorAction SilentlyContinue) {
    Write-BootLog "pm2 resurrect / restart pharmacy-web + cashflow"
    & pm2 resurrect *>> $LogFile 2>&1
    & pm2 restart pharmacy-web --update-env *>> $LogFile 2>&1
    & pm2 restart cashflow --update-env *>> $LogFile 2>&1
    if (-not (Get-Pm2Online -Name "pharmacy-web")) {
        Write-BootLog "pm2 pharmacy-web missing, trying pm2 start"
        & pm2 start npm --name "pharmacy-web" -- start *>> $LogFile 2>&1
        & pm2 save *>> $LogFile 2>&1
    }
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
    if (Get-Command tailscale -ErrorAction SilentlyContinue) {
        Write-BootLog "Tailscale Funnel setup"
        & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "windows-tailscale-funnel-setup.ps1") *>> $LogFile
    } else {
        Write-BootLog "tailscale not found, skip Funnel"
    }
}

Write-BootLog "Boot done"
Write-Host "=== Done ===" -ForegroundColor Green
Write-Host "Local: http://127.0.0.1:3000/login"
Write-Host "Auth:  http://127.0.0.1:54321/auth/v1/health"
Write-Host "Log:   $LogFile"
