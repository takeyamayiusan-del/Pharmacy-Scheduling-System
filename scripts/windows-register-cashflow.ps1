# 一次性註冊 cashflow 到 PM2，供 watchdog 之後自動拉起
# Usage (範例):
# powershell -ExecutionPolicy Bypass -File scripts\windows-register-cashflow.ps1 `
#   -ScriptPath "C:\cash-flow-app\backend\index.js" `
#   -Cwd "C:\cash-flow-app" `
#   -Port 5000

param(
    [Parameter(Mandatory = $true)][string]$ScriptPath,
    [string]$Cwd = "",
    [int]$Port = 5000,
    [string[]]$Args = @()
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

if (-not (Get-Command pm2 -ErrorAction SilentlyContinue)) {
    throw "pm2 not found. Install: npm install -g pm2"
}

if (-not (Test-Path -LiteralPath $ScriptPath)) {
    throw "ScriptPath not found: $ScriptPath"
}

if (-not $Cwd) { $Cwd = Split-Path -Parent $ScriptPath }
if (-not (Test-Path -LiteralPath $Cwd)) {
    throw "Cwd not found: $Cwd"
}

$opsDir = Join-Path $ProjectRoot "data\ops"
if (-not (Test-Path -LiteralPath $opsDir)) {
    New-Item -ItemType Directory -Path $opsDir -Force | Out-Null
}
$cfgPath = Join-Path $opsDir "cashflow-bootstrap.json"
$cfg = [ordered]@{
    script = $ScriptPath
    cwd = $Cwd
    port = $Port
    args = $Args
}
$cfg | ConvertTo-Json | Set-Content -LiteralPath $cfgPath -Encoding UTF8

$prevEap = $ErrorActionPreference
$ErrorActionPreference = "Continue"
try {
    pm2 delete cashflow 2>$null | Out-Null
} finally {
    $ErrorActionPreference = $prevEap
}

$env:PORT = [string]$Port
if ($Args.Count -gt 0) {
    & pm2 start $ScriptPath --name cashflow --cwd $Cwd --update-env -- $Args
} else {
    & pm2 start $ScriptPath --name cashflow --cwd $Cwd --update-env
}
if ($LASTEXITCODE -ne 0) {
    throw "pm2 start cashflow failed"
}

pm2 save | Out-Null
Write-Host "cashflow registered on port $Port and saved."
Write-Host "Bootstrap config: $cfgPath"
