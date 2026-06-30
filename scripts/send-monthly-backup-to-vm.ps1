# Copy monthly backup setup script to Ubuntu VM
# Run on Windows:
#   powershell -ExecutionPolicy Bypass -File scripts\send-monthly-backup-to-vm.ps1

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot

& powershell -ExecutionPolicy Bypass -File (Join-Path $ProjectRoot "scripts\send-script-to-vm.ps1") -ScriptName vm-backup-db.sh
& powershell -ExecutionPolicy Bypass -File (Join-Path $ProjectRoot "scripts\send-script-to-vm.ps1") -ScriptName vm-setup-monthly-backup.sh

Write-Host ""
Write-Host "On Ubuntu VM, run:" -ForegroundColor Green
Write-Host "  bash ~/vm-setup-monthly-backup.sh"
