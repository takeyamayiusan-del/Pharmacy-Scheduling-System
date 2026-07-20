# Copy restore script to VM and show one command to run in Ubuntu
# Usage: powershell -ExecutionPolicy Bypass -File scripts\send-restore-to-vm.ps1

param(
    [string]$VmIp = "192.168.0.118",
    [string]$VmUser = "yaosheng"
)

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$Script = Join-Path $ProjectRoot "scripts\vm-restore-db.sh"

Write-Host "Copying restore script to VM..." -ForegroundColor Cyan
scp $Script "${VmUser}@${VmIp}:~/vm-restore-db.sh"

ssh "${VmUser}@${VmIp}" "sed -i 's/\r$//' ~/vm-restore-db.sh && chmod +x ~/vm-restore-db.sh"

Write-Host ""
Write-Host "In Ubuntu SSH, run:" -ForegroundColor Green
Write-Host "  bash ~/vm-restore-db.sh"
Write-Host ""
Write-Host "Password: your Ubuntu password (typing will not show characters - normal)"
