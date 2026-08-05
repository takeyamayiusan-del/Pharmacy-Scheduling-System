# 一次性註冊 cashflow 到 PM2，供 watchdog 之後自動拉起
# Usage (範例):
# powershell -ExecutionPolicy Bypass -File scripts\windows-register-cashflow.ps1 `
#   -ScriptPath "C:\cashflow\server.js" `
#   -Cwd "C:\cashflow" `
#   -Args @()

param(
    [Parameter(Mandatory = $true)][string]$ScriptPath,
    [string]$Cwd = "",
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
    args = $Args
}
$cfg | ConvertTo-Json | Set-Content -LiteralPath $cfgPath -Encoding UTF8

pm2 delete cashflow 2>$null | Out-Null
if ($Args.Count -gt 0) {
    pm2 start $ScriptPath --name cashflow --cwd $Cwd -- $Args
} else {
    pm2 start $ScriptPath --name cashflow --cwd $Cwd
}
if ($LASTEXITCODE -ne 0) { throw "pm2 start cashflow failed" }

pm2 save | Out-Null
Write-Host "cashflow registered and saved."
Write-Host "Bootstrap config: $cfgPath"
