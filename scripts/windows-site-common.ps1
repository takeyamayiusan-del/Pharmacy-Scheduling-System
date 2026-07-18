# Shared helpers for site start / watchdog / repair

function Test-PortListening([int]$Port) {
    return [bool](netstat -ano | Select-String ":$Port\s" | Select-String "LISTENING")
}

# 用 curl 硬超時：TCP 能連但 Next 不回時，Invoke-WebRequest 常會卡住不動
function Test-HttpOk {
    param(
        [Parameter(Mandatory = $true)][string]$Uri,
        [int]$TimeoutSec = 5
    )

    try {
        $out = & curl.exe -s -o NUL -w "%{http_code}" --connect-timeout 3 --max-time $TimeoutSec $Uri 2>$null
        if ($LASTEXITCODE -ne 0) { return $false }
        $code = ("$out").Trim()
        return ($code -eq "200" -or $code -eq "204" -or $code -eq "301" -or $code -eq "302" -or $code -eq "307" -or $code -eq "308")
    } catch {
        return $false
    }
}

function Test-SiteHealthy {
    if (-not (Test-PortListening 3000)) { return $false }
    # 埠開著但不回 HTTP = 殭屍進程，必須判定 unhealthy 才能自動殺進程重啟
    return (Test-HttpOk -Uri "http://127.0.0.1:3000/login" -TimeoutSec 5)
}

function Test-BuildInProgress {
    param([string]$ProjectRoot)

    $building = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
        Where-Object {
            $_.CommandLine -and (
                $_.CommandLine -like "*next*build*" -or
                $_.CommandLine -like "*npm*run*build*" -or
                $_.CommandLine -like "*windows-start-all.ps1*"
            )
        }
    return [bool]$building
}

function Clear-StaleBuildLock {
    param(
        [string]$ProjectRoot,
        [int]$MaxAgeMinutes = 45,
        [scriptblock]$WriteLog = { param($m) Write-Host $m }
    )

    $lockFile = Get-BuildLockPath -ProjectRoot $ProjectRoot
    if (-not (Test-Path -LiteralPath $lockFile)) { return $false }

    $age = (Get-Date) - (Get-Item -LiteralPath $lockFile).LastWriteTime
    $inProgress = Test-BuildInProgress -ProjectRoot $ProjectRoot

    # 有實際 build／start-all 進程：保留鎖檔（除非超過 MaxAge，視為卡死）
    if ($inProgress -and $age.TotalMinutes -lt $MaxAgeMinutes) {
        return $false
    }

    # 沒有 build 進程 = 殘留鎖，會讓 watchdog「永遠等 build」→ 網站卡死無人修
    & $WriteLog ("Clearing stale build lock (age={0:N1}m, buildProcess={1})" -f $age.TotalMinutes, $inProgress)
    Remove-Item -LiteralPath $lockFile -Force -ErrorAction SilentlyContinue
    return $true
}

function Stop-ProjectWebProcesses {
    param([string]$ProjectRoot)

    foreach ($port in @(3000)) {
        if (-not (Test-PortListening $port)) { continue }
        $pids = netstat -ano | Select-String ":$port\s" | Select-String "LISTENING" | ForEach-Object {
            ($_ -split '\s+')[-1]
        } | Select-Object -Unique
        foreach ($procId in $pids) {
            Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
        }
    }

    Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -like "*windows-run-site.ps1*" } |
        ForEach-Object {
            Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
        }

    Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
        Where-Object {
            $cmd = $_.CommandLine
            $cmd -like "*Pharmacy-Scheduling-System*" -or $cmd -like "*\\next\\*" -or $cmd -like "*next start*" -or $cmd -like "*next build*" -or $cmd -like "*npm*start*" -or $cmd -like "*npm*run*build*"
        } |
        ForEach-Object {
            Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
        }

    Start-Sleep -Seconds 5
}

function Get-BuildLockPath {
    param([string]$ProjectRoot)
    return Join-Path $ProjectRoot "data\logs\.building"
}

function Wait-BuildLockRelease {
    param(
        [string]$ProjectRoot,
        [int]$TimeoutSeconds = 180
    )

    $lockFile = Get-BuildLockPath -ProjectRoot $ProjectRoot
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while (Test-Path -LiteralPath $lockFile) {
        if ((Get-Date) -ge $deadline) {
            return $false
        }
        Start-Sleep -Seconds 2
    }
    return $true
}

function Invoke-NpmBuild {
    param([string]$ProjectRoot)

    $npm = "C:\Program Files\nodejs\npm.cmd"
    $lockFile = Get-BuildLockPath -ProjectRoot $ProjectRoot
    $logDir = Split-Path $lockFile -Parent
    if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }

    if (-not (Wait-BuildLockRelease -ProjectRoot $ProjectRoot -TimeoutSeconds 300)) {
        throw "Another build is already running for over 5 minutes."
    }

    try {
        New-Item -ItemType File -Path $lockFile -ErrorAction Stop | Out-Null
        Stop-ProjectWebProcesses -ProjectRoot $ProjectRoot

        Write-Host "  Building site ..."
        Push-Location $ProjectRoot
        try {
            & $npm run build
            if ($LASTEXITCODE -ne 0) {
                Write-Host "  Build failed, cleaning .next and retrying once ..." -ForegroundColor Yellow
                Stop-ProjectWebProcesses -ProjectRoot $ProjectRoot
                Clear-NextBuild -ProjectRoot $ProjectRoot
                Start-Sleep -Seconds 3
                & $npm run build
                if ($LASTEXITCODE -ne 0) {
                    throw "npm run build failed with exit code $LASTEXITCODE"
                }
            }
        } finally {
            Pop-Location
        }
    } finally {
        Remove-Item -LiteralPath $lockFile -Force -ErrorAction SilentlyContinue
    }
}

function Clear-NextBuild {
    param([string]$ProjectRoot)

    $nextPath = Join-Path $ProjectRoot ".next"
    if (-not (Test-Path -LiteralPath $nextPath)) { return }

    for ($i = 1; $i -le 3; $i++) {
        try {
            Remove-Item -LiteralPath $nextPath -Recurse -Force -ErrorAction Stop
            return
        } catch {
            Start-Sleep -Seconds 2
        }
    }

    $bakName = ".next.bak." + (Get-Date -Format "yyyyMMddHHmmss")
    try {
        Rename-Item -LiteralPath $nextPath -NewName $bakName -Force -ErrorAction Stop
        return
    } catch {
        $emptyDir = Join-Path $env:TEMP ("next-empty-" + [guid]::NewGuid().ToString())
        New-Item -ItemType Directory -Path $emptyDir -Force | Out-Null
        & robocopy $emptyDir $nextPath /MIR /R:2 /W:2 /NFL /NDL /NJH /NJS /NC /NS | Out-Null
        Remove-Item -LiteralPath $emptyDir -Recurse -Force -ErrorAction SilentlyContinue
        Remove-Item -LiteralPath $nextPath -Recurse -Force -ErrorAction SilentlyContinue
    }

    if (Test-Path -LiteralPath $nextPath) {
        throw "Unable to remove .next. Close Cursor terminals using this project and retry."
    }
}

function Start-SiteRunner {
    param([string]$ProjectRoot)

    $runnerScript = Join-Path $ProjectRoot "scripts\windows-run-site.ps1"
    Start-Process powershell.exe `
        -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$runnerScript`"" `
        -WorkingDirectory $ProjectRoot `
        -WindowStyle Hidden
}

function Repair-SiteIfNeeded {
    param(
        [string]$ProjectRoot,
        [scriptblock]$WriteLog = { param($m) Write-Host $m }
    )

    if (Test-SiteHealthy) { return $true }

    [void](Clear-StaleBuildLock -ProjectRoot $ProjectRoot -MaxAgeMinutes 45 -WriteLog $WriteLog)

    $lockFile = Get-BuildLockPath -ProjectRoot $ProjectRoot
    if (Test-Path -LiteralPath $lockFile) {
        if (Test-BuildInProgress -ProjectRoot $ProjectRoot) {
            # 主動 build 進行中：本輪略過，不要等 4 分鐘卡死整支 watchdog
            & $WriteLog "Build in progress, skip repair this round"
            return $false
        }
        & $WriteLog "Orphan build lock without build process, clearing..."
        Remove-Item -LiteralPath $lockFile -Force -ErrorAction SilentlyContinue
    }

    & $WriteLog "Site unhealthy, repairing..."
    Stop-ProjectWebProcesses -ProjectRoot $ProjectRoot

    $buildIdPath = Join-Path $ProjectRoot ".next\BUILD_ID"
    if (-not (Test-Path -LiteralPath $buildIdPath)) {
        & $WriteLog "BUILD_ID missing, running npm run build..."
        try {
            Invoke-NpmBuild -ProjectRoot $ProjectRoot
        } catch {
            & $WriteLog "npm run build failed"
            return $false
        }
    }

    Start-SiteRunner -ProjectRoot $ProjectRoot

    # 最多等約 45 秒成為健康（每 5 秒用 curl 探一次）
    for ($i = 1; $i -le 9; $i++) {
        Start-Sleep -Seconds 5
        if (Test-SiteHealthy) {
            & $WriteLog "Site repaired"
            return $true
        }
    }

    & $WriteLog "Site repair failed (port may be held by zombie; will retry next minute)"
    return $false
}
