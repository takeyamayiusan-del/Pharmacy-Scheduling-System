# 每分鐘檢查：本機網站 / Supabase / Funnel，異常自動修復
$ErrorActionPreference = "Continue"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

$LogDir = Join-Path $ProjectRoot "data\logs"
$LogFile = Join-Path $LogDir "docker-watchdog.log"
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

function Log([string]$Message) {
    $line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $Message"
    Add-Content -Path $LogFile -Value $line -Encoding UTF8
}

$env:Path = @(
    $env:Path,
    "C:\Program Files\nodejs",
    "C:\Program Files\Docker\Docker\resources\bin",
    "$env:APPDATA\npm",
    "C:\Program Files\Tailscale"
) -join ";"

function Test-HttpOk([string]$Uri, [int]$TimeoutSec = 5) {
    try {
        $out = & curl.exe -s -o NUL -w "%{http_code}" --connect-timeout 3 --max-time $TimeoutSec $Uri 2>$null
        if ($LASTEXITCODE -ne 0) { return $false }
        $code = ("$out").Trim()
        return @("200", "204", "301", "302", "307", "308") -contains $code
    } catch {
        return $false
    }
}

Log "watchdog check"

# Docker
try {
    docker info 1>$null 2>$null
    if ($LASTEXITCODE -ne 0) {
        Log "Docker down — skip (wait for user session / Docker Desktop)"
        exit 1
    }
} catch {
    Log "Docker unavailable"
    exit 1
}

# Supabase API
if (-not (Test-HttpOk "http://127.0.0.1:54321/auth/v1/health" 8)) {
    Log "Supabase unhealthy → supabase start"
    & supabase start *>> $LogFile
    Start-Sleep -Seconds 15
}

# Website
$siteOk = Test-HttpOk "http://127.0.0.1:3000/login" 5
if (-not $siteOk) {
    Log "Site unhealthy → pm2 restart"
    $eco = Join-Path $ProjectRoot "ecosystem.config.cjs"
    & pm2 describe pharmacy-web 1>$null 2>$null
    if ($LASTEXITCODE -ne 0) {
        & pm2 start $eco *>> $LogFile
    } else {
        & pm2 restart pharmacy-web *>> $LogFile
    }
    & pm2 save *>> $LogFile
    Start-Sleep -Seconds 8
    $siteOk = Test-HttpOk "http://127.0.0.1:3000/login" 5
}

# Funnel
$funnelStatus = (& tailscale funnel status 2>&1 | Out-String)
if ($funnelStatus -notmatch "Funnel on" -or $funnelStatus -notmatch "127\.0\.0\.1:3000") {
    Log "Funnel down → restart funnel"
    & tailscale funnel --bg 3000 *>> $LogFile
}

if ($siteOk) {
    Log "OK site+supabase"
    exit 0
}

Log "FAIL site still down"
exit 1
