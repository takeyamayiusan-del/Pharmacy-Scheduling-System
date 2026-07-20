# DEPRECATED: do not run alongside YaoshengDockerWatchdog.
# Old funnel-watchdog called funnel-setup with reset and fought the multi-site watchdog.
# This stub only forwards to the multi-site docker watchdog (no funnel reset).

$ErrorActionPreference = "Continue"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$LogDir = Join-Path $ProjectRoot "data\logs"
$LogFile = Join-Path $LogDir "funnel-watchdog.log"

function Write-Log([string]$Message) {
    if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir -Force | Out-Null }
    Add-Content -Path $LogFile -Value "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $Message" -Encoding UTF8
}

Write-Log "DEPRECATED funnel-watchdog -> forwarding to windows-docker-watchdog.ps1 (no reset)"
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "windows-docker-watchdog.ps1")
exit $LASTEXITCODE
