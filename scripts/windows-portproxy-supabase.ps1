# Forward Windows port 54321 to Ubuntu VM Supabase API
# Run as Administrator:
#   powershell -ExecutionPolicy Bypass -File scripts\windows-portproxy-supabase.ps1 -VmIp 192.168.1.100

param(
    [Parameter(Mandatory = $true)]
    [string]$VmIp,
    [int]$Port = 54321
)

$ErrorActionPreference = "Stop"

Write-Host "=== Supabase port proxy ===" -ForegroundColor Cyan
Write-Host "Windows 0.0.0.0:${Port} -> ${VmIp}:${Port}"
Write-Host ""

netsh interface portproxy delete v4tov4 listenport=$Port listenaddress=0.0.0.0 2>$null | Out-Null
netsh interface portproxy delete v4tov4 listenport=$Port listenaddress=127.0.0.1 2>$null | Out-Null

netsh interface portproxy add v4tov4 listenport=$Port listenaddress=0.0.0.0 connectport=$Port connectaddress=$VmIp
netsh interface portproxy add v4tov4 listenport=$Port listenaddress=127.0.0.1 connectport=$Port connectaddress=$VmIp

$ruleName = "Yaosheng Supabase Port $Port"
if (-not (Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue)) {
    New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Protocol TCP -LocalPort $Port -Action Allow | Out-Null
    Write-Host "Firewall rule added: $ruleName" -ForegroundColor Green
}

Write-Host ""
Write-Host "Port proxy rules:" -ForegroundColor Green
netsh interface portproxy show v4tov4

Write-Host ""
Write-Host "Use in Windows .env.local:" -ForegroundColor Yellow
Write-Host "  NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:$Port"
Write-Host ""
Write-Host "Test (after supabase start in VM):" -ForegroundColor Yellow
Write-Host "  Invoke-WebRequest -Uri http://127.0.0.1:$Port/rest/v1/ -UseBasicParsing"
