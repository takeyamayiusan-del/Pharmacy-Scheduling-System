# Copy a helper script to Ubuntu VM
# Usage:
#   powershell -ExecutionPolicy Bypass -File scripts\send-script-to-vm.ps1 -ScriptName vm-fix-supabase-start.sh
#   powershell -ExecutionPolicy Bypass -File scripts\send-script-to-vm.ps1 -ScriptName vm-restore-db.sh

param(
    [string]$VmIp = "192.168.0.118",
    [string]$VmUser = "yaosheng",
    [Parameter(Mandatory = $true)]
    [string]$ScriptName
)

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$Script = Join-Path $ProjectRoot "scripts\$ScriptName"
$Remote = "~/$ScriptName"

if (-not (Test-Path $Script)) {
    throw "Script not found: $Script"
}

Write-Host "Copying $ScriptName to VM..." -ForegroundColor Cyan
scp $Script "${VmUser}@${VmIp}:$Remote"
ssh "${VmUser}@${VmIp}" "sed -i 's/\r$//' $Remote && chmod +x $Remote"

Write-Host ""
Write-Host "In Ubuntu SSH, run:" -ForegroundColor Green
Write-Host "  bash $Remote"
