# Yaosheng Pharmacy - Windows post-boot startup (Hyper-V VM)
# Primary startup script — use this instead of 重開機後啟動.bat
# Run (auto-elevates to Administrator if needed):
#   powershell -ExecutionPolicy Bypass -File scripts\windows-start-all.ps1
#   powershell -ExecutionPolicy Bypass -File scripts\windows-start-all.ps1 -VmIp 192.168.0.118
#   powershell -ExecutionPolicy Bypass -File scripts\windows-start-all.ps1 -SkipTailscale

param(
    [string]$VmName = "yaosheng-supabase",
    [string]$VmIp = "192.168.0.118",
    [switch]$SkipTailscale,
    [switch]$Rebuild
)

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator
)
if (-not $isAdmin) {
    Write-Host "Requesting Administrator privileges..." -ForegroundColor Yellow
    $elevateArgs = "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`""
    if ($VmName -ne "yaosheng-supabase") { $elevateArgs += " -VmName `"$VmName`"" }
    if ($VmIp -ne "192.168.0.118") { $elevateArgs += " -VmIp `"$VmIp`"" }
    if ($SkipTailscale) { $elevateArgs += " -SkipTailscale" }
    if ($Rebuild) { $elevateArgs += " -Rebuild" }
    Start-Process powershell.exe -Verb RunAs -ArgumentList $elevateArgs
    exit 0
}

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

$nodeDir = "C:\Program Files\nodejs"
$npm = Join-Path $nodeDir "npm.cmd"
. (Join-Path $PSScriptRoot "windows-site-common.ps1")

function Invoke-Step([string]$Title, [scriptblock]$Action) {
    Write-Host $Title -ForegroundColor Yellow
    try {
        & $Action
    } catch {
        Write-Host "  FAILED: $($_.Exception.Message)" -ForegroundColor Red
        return $false
    }
    return $true
}

Write-Host "=== Yaosheng Pharmacy startup ===" -ForegroundColor Cyan
Write-Host "  Running as Administrator" -ForegroundColor Green
Write-Host ""

# 1) Start Hyper-V VM
Invoke-Step "[1/5] Hyper-V VM: $VmName" {
    $vm = Get-VM -Name $VmName -ErrorAction SilentlyContinue
    if ($null -eq $vm) {
        Write-Host "  VM not found, skipping (check VM name)" -ForegroundColor Red
    } elseif ($vm.State -ne "Running") {
        Start-VM -Name $VmName
        Write-Host "  VM started, waiting 90s for Ubuntu + Supabase boot..." -ForegroundColor Green
        Start-Sleep -Seconds 90
    } else {
        Write-Host "  VM already running" -ForegroundColor Green
    }
} | Out-Null

# 2) Port proxy
Invoke-Step "[2/5] Supabase port proxy -> $VmIp" {
    & powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "windows-portproxy-supabase.ps1") -VmIp $VmIp | Out-Host
} | Out-Null

# 3) Wait for API
Write-Host "[3/5] Waiting for Supabase API..." -ForegroundColor Yellow
$ok = $false
for ($i = 1; $i -le 45; $i++) {
    try {
        $r = Invoke-WebRequest -Uri "http://127.0.0.1:54321/auth/v1/health" -UseBasicParsing -TimeoutSec 5
        if ($r.StatusCode -eq 200) { $ok = $true; break }
    } catch {}
    Write-Host "  Retry $i/45 ..."
    Start-Sleep -Seconds 4
}
if (-not $ok) {
    Write-Host "  Warning: Auth API not ready. On VM run: supabase start --ignore-health-check" -ForegroundColor Red
} else {
    Write-Host "  Auth API OK" -ForegroundColor Green
}

# 4) Start web app
Invoke-Step "[4/5] Next.js site :3000" {
    Stop-ProjectWebProcesses -ProjectRoot $ProjectRoot

    $buildIdPath = Join-Path $ProjectRoot ".next\BUILD_ID"
    if ($Rebuild) {
        Write-Host "  Force rebuild requested (-Rebuild) ..." -ForegroundColor Yellow
        Clear-NextBuild -ProjectRoot $ProjectRoot
        Invoke-NpmBuild -ProjectRoot $ProjectRoot
    } elseif (-not (Test-Path -LiteralPath $buildIdPath)) {
        Write-Host "  No production build found, building ..."
        Invoke-NpmBuild -ProjectRoot $ProjectRoot
    } elseif (Test-SiteHealthy) {
        Write-Host "  Site already healthy, skipping rebuild (use -Rebuild after git pull)" -ForegroundColor Green
    } else {
        Write-Host "  Site down but build exists, rebuilding ..."
        Invoke-NpmBuild -ProjectRoot $ProjectRoot
    }

    Start-SiteRunner -ProjectRoot $ProjectRoot
    Start-Sleep -Seconds 10
    if (Test-SiteHealthy) {
        Write-Host "  Site started: http://localhost:3000" -ForegroundColor Green
    } else {
        throw "Site did not start on port 3000. Run: powershell -File scripts\windows-start-all.ps1 -Rebuild"
    }
} | Out-Null

# 5) Tailscale Funnel (optional)
if (-not $SkipTailscale) {
    Invoke-Step "[5/5] Tailscale Funnel" {
        if (-not (Get-Command tailscale -ErrorAction SilentlyContinue)) {
            Write-Host "  Tailscale not installed, skipping funnel setup" -ForegroundColor Yellow
        } else {
            & powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "windows-tailscale-funnel-setup.ps1") | Out-Host
        }
    } | Out-Null
} else {
    Write-Host "[5/5] Skipping Tailscale (-SkipTailscale)" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=== Done ===" -ForegroundColor Green
Write-Host "Local login: http://localhost:3000/login"
Write-Host 'Health check: Invoke-WebRequest http://127.0.0.1:54321/auth/v1/health -UseBasicParsing'
