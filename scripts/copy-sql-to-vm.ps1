# Copy SQL backup from Windows to Ubuntu VM (VM needs OpenSSH)
# Usage:
#   powershell -ExecutionPolicy Bypass -File scripts\copy-sql-to-vm.ps1 -VmIp 192.168.1.100 -VmUser yaosheng

param(
    [Parameter(Mandatory = $true)]
    [string]$VmIp,
    [string]$VmUser = "yaosheng",
    [string]$SqlFile = ""
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot

if (-not $SqlFile) {
    $SqlFile = Join-Path $ProjectRoot "data\backups\yaosheng-local-2026-06-29.sql"
}

if (-not (Test-Path $SqlFile)) {
    throw "SQL file not found: $SqlFile"
}

$remoteDir = "/home/$VmUser/Pharmacy-Scheduling-System/data/backups"
$remoteFile = "$remoteDir/yaosheng-local-2026-06-29.sql"

Write-Host "Copying SQL to VM..." -ForegroundColor Cyan
Write-Host "  From: $SqlFile"
Write-Host "  To  : ${VmUser}@${VmIp}:$remoteFile"
Write-Host ""

ssh "${VmUser}@${VmIp}" "mkdir -p $remoteDir"
scp $SqlFile "${VmUser}@${VmIp}:$remoteFile"

Write-Host ""
Write-Host "Done. Restore in VM:" -ForegroundColor Green
Write-Host '  DB=$(docker ps --format ''{{.Names}}'' | grep supabase_db | head -n 1)'
Write-Host '  cat ~/Pharmacy-Scheduling-System/data/backups/yaosheng-local-2026-06-29.sql | docker exec -i $DB psql -U postgres -d postgres'
