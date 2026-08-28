# 註冊每日附件清理排程（本機 Supabase，不需 Supabase Cloud）
# 管理員 PowerShell：
#   powershell -ExecutionPolicy Bypass -File scripts\windows-register-cleanup-task.ps1

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$TaskName = "YaoshengPharmacyAttachmentCleanup"
$NodeExe = (Get-Command node -ErrorAction Stop).Source
$NpmCli = Join-Path (Split-Path $NodeExe) "node_modules\npm\bin\npm-cli.js"

if (-not (Test-Path -LiteralPath $NpmCli)) {
    $NpmCmd = (Get-Command npm -ErrorAction Stop).Source
    $Action = New-ScheduledTaskAction -Execute $NpmCmd -Argument "run data:cleanup-attachments" -WorkingDirectory $ProjectRoot
} else {
    $Action = New-ScheduledTaskAction -Execute $NodeExe -Argument "`"$NpmCli`" run data:cleanup-attachments" -WorkingDirectory $ProjectRoot
}

$Trigger = New-ScheduledTaskTrigger -Daily -At "03:00"
$Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
$Principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Highest

Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Settings $Settings -Principal $Principal -Force | Out-Null

Write-Host "Registered scheduled task: $TaskName (daily 03:00)" -ForegroundColor Green
Write-Host "Manual test:" -ForegroundColor Yellow
Write-Host "  cd $ProjectRoot"
Write-Host "  npm run data:cleanup-attachments"
