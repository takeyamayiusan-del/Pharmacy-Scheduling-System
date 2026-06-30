# Tailscale Funnel (new CLI): expose Next.js only; API via next.config.js rewrites
# Run as Administrator:
#   powershell -ExecutionPolicy Bypass -File scripts\windows-tailscale-funnel-setup.ps1

$ErrorActionPreference = "Stop"

if (-not (Get-Command tailscale -ErrorAction SilentlyContinue)) {
    throw "tailscale not found. Install Tailscale first."
}

Write-Host "=== Tailscale Funnel ===" -ForegroundColor Cyan

tailscale funnel reset 2>$null
tailscale serve reset 2>$null

# New CLI: funnel <port> exposes directly to the internet
tailscale funnel --bg --yes 3000

Write-Host ""
tailscale funnel status

Write-Host ""
Write-Host "Employee URL should show 'Available on the internet'" -ForegroundColor Yellow
Write-Host "Example: https://win-cbtk6obueou.tailbaf7c7.ts.net"
Write-Host ""
Write-Host "Verify API rewrite:" -ForegroundColor Yellow
Write-Host "  Invoke-WebRequest https://YOUR-URL/auth/v1/health -UseBasicParsing"
