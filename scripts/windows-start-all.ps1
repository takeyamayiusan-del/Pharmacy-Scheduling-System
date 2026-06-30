# 耀聖藥局 — Windows 開機後一鍵啟動（Hyper-V VM 架構）
# 以系統管理員執行：
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

Write-Host "=== 耀聖藥局 開機啟動 ===" -ForegroundColor Cyan
Write-Host ""

# 1) 啟動 Hyper-V VM
Write-Host "[1/5] Hyper-V VM: $VmName" -ForegroundColor Yellow
$vm = Get-VM -Name $VmName -ErrorAction SilentlyContinue
if ($null -eq $vm) {
    Write-Host "  找不到 VM，略過（請確認 VM 名稱）" -ForegroundColor Red
} elseif ($vm.State -ne "Running") {
    Start-VM -Name $VmName
    Write-Host "  已啟動 VM，等待 60 秒讓 Ubuntu 開機..." -ForegroundColor Green
    Start-Sleep -Seconds 60
} else {
    Write-Host "  VM 已在運行" -ForegroundColor Green
}

# 2) Port proxy
Write-Host "[2/5] Supabase port proxy -> $VmIp" -ForegroundColor Yellow
& powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "windows-portproxy-supabase.ps1") -VmIp $VmIp | Out-Host

# 3) 等待 API
Write-Host "[3/5] 等待 Supabase API..." -ForegroundColor Yellow
$ok = $false
for ($i = 1; $i -le 30; $i++) {
    try {
        $r = Invoke-WebRequest -Uri "http://127.0.0.1:54321/auth/v1/health" -UseBasicParsing -TimeoutSec 5
        if ($r.StatusCode -eq 200) { $ok = $true; break }
    } catch {}
    Write-Host "  重試 $i/30 ..."
    Start-Sleep -Seconds 4
}
if (-not $ok) {
    Write-Host "  警告：Auth API 尚未就緒。請在 VM 執行: supabase start --ignore-health-check" -ForegroundColor Red
} else {
    Write-Host "  Auth API OK" -ForegroundColor Green
}

# 4) 啟動網站
Write-Host "[4/5] Next.js 網站 :3000" -ForegroundColor Yellow
if (Test-PortListening 3000) {
    Write-Host "  埠 3000 已被佔用，略過啟動（可能已在跑）" -ForegroundColor Green
} else {
    if (-not (Test-Path ".next")) {
        Write-Host "  首次建置 npm run build ..."
        & $npm run build
    }
    Start-Process -FilePath $npm -ArgumentList "start" -WorkingDirectory $ProjectRoot -WindowStyle Hidden
    Start-Sleep -Seconds 5
    if (Test-PortListening 3000) {
        Write-Host "  網站已啟動 http://localhost:3000" -ForegroundColor Green
    } else {
        Write-Host "  網站啟動可能失敗，請手動 npm start" -ForegroundColor Red
    }
}

# 5) Tailscale Funnel（可選）
if (-not $SkipTailscale) {
    Write-Host "[5/5] Tailscale Funnel" -ForegroundColor Yellow
    $ts = Get-Command tailscale -ErrorAction SilentlyContinue
    if ($null -eq $ts) {
        Write-Host "  未安裝 Tailscale，略過。請先安裝後再執行 funnel。" -ForegroundColor Yellow
    } else {
        & powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "windows-tailscale-funnel-setup.ps1") | Out-Host
    }
} else {
    Write-Host "[5/5] 略過 Tailscale（-SkipTailscale）" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=== 完成 ===" -ForegroundColor Green
Write-Host "本機登入: http://localhost:3000/login"
Write-Host "檢查: Invoke-WebRequest http://127.0.0.1:54321/auth/v1/health -UseBasicParsing"
