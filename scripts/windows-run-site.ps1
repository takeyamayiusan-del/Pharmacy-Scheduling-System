# Keeps Next.js production server running; restarts automatically after crashes.
param(
    [string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = "Continue"
$LogDir = Join-Path $ProjectRoot "data\logs"
$LogFile = Join-Path $LogDir "site-runner.log"
$npm = "C:\Program Files\nodejs\npm.cmd"

function Write-Log([string]$Message) {
    if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir -Force | Out-Null }
    Add-Content -Path $LogFile -Value "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $Message" -Encoding UTF8
}

Set-Location $ProjectRoot
Write-Log "Site runner started (PID $PID)"

while ($true) {
    Write-Log "Launching npm start..."
    $proc = Start-Process -FilePath $npm -ArgumentList "start" -WorkingDirectory $ProjectRoot -PassThru -NoNewWindow -Wait
    $code = if ($null -ne $proc.ExitCode) { $proc.ExitCode } else { "unknown" }
    Write-Log "npm start exited (code=$code), restarting in 15 seconds..."
    Start-Sleep -Seconds 15
}
