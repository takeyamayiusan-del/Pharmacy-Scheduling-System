# Yaosheng Pharmacy - Windows post-boot startup (Hyper-V VM)
# Run as Administrator:
#   powershell -ExecutionPolicy Bypass -File scripts\windows-start-all.ps1
#   powershell -ExecutionPolicy Bypass -File scripts\windows-start-all.ps1 -VmIp 192.168.0.118

param(
    [string]$VmName = "yaosheng-supabase",
    [string]$VmIp = "192.168.0.118",
    [switch]$SkipTailscale
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

$nodeDir = "C:\Program Files\nodejs"
$npm = Join-Path $nodeDir "npm.cmd"

function Test-PortListening([int]$Port) {
    return [bool](netstat -ano | Select-String ":$Port\s" | Select-String "LISTENING")
}

Write-Host "=== Yaosheng Pharmacy startup ===" -ForegroundColor Cyan
Write-Host ""

# 1) Start Hyper-V VM
Write-Host "[1/5] Hyper-V VM: $VmName" -ForegroundColor Yellow
$vm = Get-VM -Name $VmName -ErrorAction SilentlyContinue
if ($null -eq $vm) {
    Write-Host "  VM not found, skipping (check VM name)" -ForegroundColor Red
} elseif ($vm.State -ne "Running") {
    Start-VM -Name $VmName
    Write-Host "  VM started, waiting 60s for Ubuntu boot..." -ForegroundColor Green
    Start-Sleep -Seconds 60
} else {
    Write-Host "  VM already running" -ForegroundColor Green
}

# 2) Port proxy
Write-Host "[2/5] Supabase port proxy -> $VmIp" -ForegroundColor Yellow
& powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "windows-portproxy-supabase.ps1") -VmIp $VmIp | Out-Host

# 3) Wait for API
Write-Host "[3/5] Waiting for Supabase API..." -ForegroundColor Yellow
$ok = $false
for ($i = 1; $i -le 30; $i++) {
    try {
        $r = Invoke-WebRequest -Uri "http://127.0.0.1:54321/auth/v1/health" -UseBasicParsing -TimeoutSec 5
        if ($r.StatusCode -eq 200) { $ok = $true; break }
    } catch {}
    Write-Host "  Retry $i/30 ..."
    Start-Sleep -Seconds 4
}
if (-not $ok) {
    Write-Host "  Warning: Auth API not ready. On VM run: supabase start --ignore-health-check" -ForegroundColor Red
} else {
    Write-Host "  Auth API OK" -ForegroundColor Green
}

# 4) Start web app
Write-Host "[4/5] Next.js site :3000" -ForegroundColor Yellow
if (Test-PortListening 3000) {
    Write-Host "  Port 3000 in use, skipping start (may already be running)" -ForegroundColor Green
} else {
    if (-not (Test-Path ".next")) {
        Write-Host "  First run: npm run build ..."
        & $npm run build
    }
    Start-Process -FilePath $npm -ArgumentList "start" -WorkingDirectory $ProjectRoot -WindowStyle Hidden
    Start-Sleep -Seconds 5
    if (Test-PortListening 3000) {
        Write-Host "  Site started: http://localhost:3000" -ForegroundColor Green
    } else {
        Write-Host "  Site may have failed to start; run npm start manually" -ForegroundColor Red
    }
}

# 5) Tailscale Funnel (optional)
if (-not $SkipTailscale) {
    Write-Host "[5/5] Tailscale Funnel" -ForegroundColor Yellow
    $ts = Get-Command tailscale -ErrorAction SilentlyContinue
    if ($null -eq $ts) {
        Write-Host "  Tailscale not installed, skipping funnel setup" -ForegroundColor Yellow
    } else {
        & powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "windows-tailscale-funnel-setup.ps1") | Out-Host
    }
} else {
    Write-Host "[5/5] Skipping Tailscale (-SkipTailscale)" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=== Done ===" -ForegroundColor Green
Write-Host "Local login: http://localhost:3000/login"
Write-Host 'Health check: Invoke-WebRequest http://127.0.0.1:54321/auth/v1/health -UseBasicParsing'
