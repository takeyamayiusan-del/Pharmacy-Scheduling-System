# Register auto-start on Windows logon (Task Scheduler)
# Run as Administrator:
#   powershell -ExecutionPolicy Bypass -File scripts\windows-register-startup-task.ps1

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$StartScript = Join-Path $ProjectRoot "scripts\windows-start-all.ps1"
$TaskName = "YaoshengPharmacyStart"

$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$StartScript`""
$trigger = New-ScheduledTaskTrigger -AtLogOn
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable

Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description "Yaosheng pharmacy auto start"

$vm = Get-VM -Name "yaosheng-supabase" -ErrorAction SilentlyContinue
if ($vm) {
    Set-VM -Name "yaosheng-supabase" -AutomaticStartAction Start -AutomaticStartDelay 10
    Write-Host "Hyper-V VM auto-start: enabled" -ForegroundColor Green
}

Write-Host ""
Write-Host "Scheduled task registered: $TaskName" -ForegroundColor Green
Write-Host "On logon, runs: windows-start-all.ps1"
