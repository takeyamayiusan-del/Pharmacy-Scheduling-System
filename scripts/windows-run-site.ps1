# Keeps Next.js production server running; restarts after crash OR hang (zombie).
param(
    [string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = "Continue"
$LogDir = Join-Path $ProjectRoot "data\logs"
$LogFile = Join-Path $LogDir "site-runner.log"
$LockFile = Join-Path $LogDir ".building"
$npm = "C:\Program Files\nodejs\npm.cmd"

. (Join-Path $PSScriptRoot "windows-site-common.ps1")

function Write-Log([string]$Message) {
    if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir -Force | Out-Null }
    Add-Content -Path $LogFile -Value "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $Message" -Encoding UTF8
}

function Stop-Tree([int]$ProcessId) {
    if ($ProcessId -le 0) { return }
    try {
        & taskkill.exe /PID $ProcessId /T /F 2>$null | Out-Null
    } catch {
        Stop-Process -Id $ProcessId -Force -ErrorAction SilentlyContinue
    }
}

Set-Location $ProjectRoot
Write-Log "Site runner started (PID $PID)"

while ($true) {
    while (Test-Path -LiteralPath $LockFile) {
        [void](Clear-StaleBuildLock -ProjectRoot $ProjectRoot -MaxAgeMinutes 45 -WriteLog { param($m) Write-Log $m })
        if (-not (Test-Path -LiteralPath $LockFile)) { break }
        Write-Log "Build in progress, waiting..."
        Start-Sleep -Seconds 5
    }

    Write-Log "Launching npm start..."
    $proc = Start-Process -FilePath $npm -ArgumentList "start" -WorkingDirectory $ProjectRoot -PassThru -NoNewWindow
    if (-not $proc) {
        Write-Log "Failed to start npm; retry in 15s"
        Start-Sleep -Seconds 15
        continue
    }

    $failStreak = 0
    $readyGraceUntil = (Get-Date).AddSeconds(40)

    while (-not $proc.HasExited) {
        Start-Sleep -Seconds 20

        if (Test-Path -LiteralPath $LockFile) {
            Write-Log "Build lock appeared; stopping site for rebuild"
            Stop-Tree -ProcessId $proc.Id
            break
        }

        # 啟動寬限期過後，連續 3 次 HTTP 失敗 = 卡死，強制殺樹重啟
        if ((Get-Date) -lt $readyGraceUntil) { continue }

        if (Test-SiteHealthy) {
            $failStreak = 0
            continue
        }

        $failStreak += 1
        Write-Log "Health check failed ($failStreak/3) while npm still running (PID $($proc.Id))"
        if ($failStreak -ge 3) {
            Write-Log "Next.js hung (zombie). Killing process tree and restarting..."
            Stop-Tree -ProcessId $proc.Id
            # 再清一次占用 3000 的殘留
            Stop-ProjectWebProcesses -ProjectRoot $ProjectRoot
            break
        }
    }

    if (-not $proc.HasExited) {
        try { $proc.Refresh() } catch { }
    }

    $code = if ($proc.HasExited -and $null -ne $proc.ExitCode) { $proc.ExitCode } else { "killed/unknown" }
    Write-Log "npm start stopped (code=$code), restarting in 10 seconds..."
    Start-Sleep -Seconds 10
}
