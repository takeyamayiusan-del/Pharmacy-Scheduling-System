# Shared helpers for site start / watchdog / repair (Docker + PM2)

function Test-PortListening([int]$Port) {
    return [bool](netstat -ano | Select-String ":$Port\s" | Select-String "LISTENING")
}

function Get-PortListenerPid([int]$Port) {
    $line = netstat -ano | Select-String ":$Port\s" | Select-String "LISTENING" | Select-Object -First 1
    if (-not $line) { return $null }
    $parts = ($line.ToString().Trim() -split "\s+") | Where-Object { $_ -ne "" }
    if ($parts.Length -lt 5) { return $null }
    $processId = 0
    if ([int]::TryParse($parts[-1], [ref]$processId)) { return $processId }
    return $null
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

function Test-AuthHealthy {
    return (Test-HttpOk -Uri "http://127.0.0.1:54321/auth/v1/health" -TimeoutSec 5)
}

# 清除舊 Hyper-V 留下的 54321 portproxy（會把流量轉去不存在的 VM）
function Clear-StaleSupabasePortProxy {
    param([scriptblock]$WriteLog = { param($m) Write-Host $m })

    $raw = (netsh interface portproxy show all 2>$null | Out-String)
    if (-not $raw) { return $false }
    if ($raw -notmatch "54321") { return $false }

    & $WriteLog "Removing stale portproxy on 54321 (old Hyper-V forward)..."
    netsh interface portproxy delete v4tov4 listenport=54321 listenaddress=0.0.0.0 2>$null | Out-Null
    netsh interface portproxy delete v4tov4 listenport=54321 listenaddress=127.0.0.1 2>$null | Out-Null
    return $true
}

function Repair-AuthIfNeeded {
    param(
        [string]$ProjectRoot,
        [scriptblock]$WriteLog = { param($m) Write-Host $m }
    )

    [void](Clear-StaleSupabasePortProxy -WriteLog $WriteLog)

    if (Test-AuthHealthy) { return $true }

    & $WriteLog "Auth unhealthy, repairing Docker Supabase..."

    $names = @(docker ps --format "{{.Names}}" 2>$null)
    $kong = ($names | Where-Object { $_ -like "*supabase_kong*" } | Select-Object -First 1)
    $auth = ($names | Where-Object { $_ -like "*supabase_auth*" } | Select-Object -First 1)
    if ($kong) {
        docker restart $kong 2>$null | Out-Null
    }
    if ($auth) {
        docker restart $auth 2>$null | Out-Null
    }

    Start-Sleep -Seconds 6
    if (Test-AuthHealthy) {
        & $WriteLog "Auth repaired via docker restart"
        return $true
    }

    if (Get-Command supabase -ErrorAction SilentlyContinue) {
        & $WriteLog "Running supabase start..."
        Push-Location $ProjectRoot
        try {
            & supabase start 2>$null | Out-Null
        } finally {
            Pop-Location
        }
        Start-Sleep -Seconds 8
        if (Test-AuthHealthy) {
            & $WriteLog "Auth repaired via supabase start"
            return $true
        }
    }

    & $WriteLog "Auth still unhealthy"
    return $false
}

function Test-BuildInProgress {
    param([string]$ProjectRoot)

    $building = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
        Where-Object {
            $_.CommandLine -and (
                $_.CommandLine -like "*next*build*" -or
                $_.CommandLine -like "*npm*run*build*" -or
                $_.CommandLine -like "*windows-docker-boot.ps1*"
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

        # 先停 PM2，避免 build 期間 autorestart 或與 next start 同時讀寫 .next
        if (Get-Command pm2 -ErrorAction SilentlyContinue) {
            & pm2 stop pharmacy-web 2>$null | Out-Null
        }
        Stop-ProjectWebProcesses -ProjectRoot $ProjectRoot

        Write-Host "  Building site (old server stopped) ..."
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
            if (-not (Test-PharmacyWebBuildReady -ProjectRoot $ProjectRoot)) {
                throw "Build finished but .next artifacts are incomplete"
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

function Test-CashflowHealthy {
    # 金流本機常見埠：8443（外網 Funnel）或 3001
    if (Test-PortListening 8443) {
        if (Test-HttpOk -Uri "http://127.0.0.1:8443/" -TimeoutSec 5) { return $true }
        # HTTPS only locally uncommon; port open still counts as process up
        return $true
    }
    if (Test-PortListening 3001) {
        return (Test-HttpOk -Uri "http://127.0.0.1:3001/" -TimeoutSec 5)
    }
    return $false
}

function Get-Pm2Online([string]$Name) {
    if (-not (Get-Command pm2 -ErrorAction SilentlyContinue)) { return $false }
    $j = & pm2 jlist 2>$null
    if (-not $j) { return $false }
    try {
        $apps = $j | ConvertFrom-Json
        $app = $apps | Where-Object { $_.name -eq $Name } | Select-Object -First 1
        if (-not $app) { return $false }
        return ($app.pm2_env.status -eq "online")
    } catch {
        return $false
    }
}

function Test-Pm2AppExists([string]$Name) {
    if (-not (Get-Command pm2 -ErrorAction SilentlyContinue)) { return $false }
    $j = & pm2 jlist 2>$null
    if (-not $j) { return $false }
    try {
        $apps = $j | ConvertFrom-Json
        return [bool]($apps | Where-Object { $_.name -eq $Name } | Select-Object -First 1)
    } catch {
        return $false
    }
}

function Get-Pm2Pid([string]$Name) {
    if (-not (Get-Command pm2 -ErrorAction SilentlyContinue)) { return $null }
    $j = & pm2 jlist 2>$null
    if (-not $j) { return $null }
    try {
        $apps = $j | ConvertFrom-Json
        $app = $apps | Where-Object { $_.name -eq $Name } | Select-Object -First 1
        if (-not $app) { return $null }
        $processId = 0
        if ([int]::TryParse("$($app.pid)", [ref]$processId) -and $processId -gt 0) { return $processId }
        return $null
    } catch {
        return $null
    }
}

function Stop-PortListenerForce {
    param(
        [int]$Port,
        [scriptblock]$WriteLog = { param($m) Write-Host $m }
    )
    $listenerPid = Get-PortListenerPid -Port $Port
    if (-not $listenerPid -or $listenerPid -le 0) { return $false }
    & $WriteLog ("Killing listener on :{0} pid={1}" -f $Port, $listenerPid)

    $prevEap = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        try { Stop-Process -Id $listenerPid -Force -ErrorAction SilentlyContinue } catch {}

        # taskkill 失敗訊息會寫 stderr；不可讓 $ErrorActionPreference=Stop 中斷整個更新腳本
        $null = cmd.exe /c "taskkill /F /PID $listenerPid /T" 2>&1

        if (Test-PortListening $Port) {
            $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$listenerPid" -ErrorAction SilentlyContinue
            if ($proc -and $proc.ParentProcessId -and $proc.ParentProcessId -ne 0) {
                & $WriteLog ("Port still held; also killing parent pid={0}" -f $proc.ParentProcessId)
                try { Stop-Process -Id $proc.ParentProcessId -Force -ErrorAction SilentlyContinue } catch {}
                $null = cmd.exe /c "taskkill /F /PID $($proc.ParentProcessId) /T" 2>&1
            }
        }
    } finally {
        $ErrorActionPreference = $prevEap
    }

    Start-Sleep -Seconds 1
    return (-not (Test-PortListening $Port))
}

function Test-PharmacyWebBuildReady {
    param([string]$ProjectRoot)

    $paths = @(
        (Join-Path $ProjectRoot ".next\BUILD_ID"),
        (Join-Path $ProjectRoot ".next\prerender-manifest.json"),
        (Join-Path $ProjectRoot ".next\server")
    )
    foreach ($p in $paths) {
        if (-not (Test-Path -LiteralPath $p)) { return $false }
    }
    return $true
}

function Get-PharmacyWebEcosystemPath {
    param([string]$ProjectRoot)
    return Join-Path $ProjectRoot "ecosystem.config.cjs"
}

function Clear-PharmacyWebPort {
    param(
        [scriptblock]$WriteLog = { param($m) Write-Host $m },
        [int]$MaxRounds = 5
    )

    $prevEap = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        pm2 stop pharmacy-web 2>$null | Out-Null
        Start-Sleep -Seconds 1
        for ($i = 1; $i -le $MaxRounds; $i++) {
            $listenerPid = Get-PortListenerPid -Port 3000
            if (-not $listenerPid) { return $true }
            & $WriteLog ("[{0}/{1}] Clearing :3000 pid={2} ..." -f $i, $MaxRounds, $listenerPid)
            [void](Stop-PortListenerForce -Port 3000 -WriteLog $WriteLog)
            Start-Sleep -Seconds 2
        }
    } finally {
        $ErrorActionPreference = $prevEap
    }
    return (-not (Test-PortListening 3000))
}

function Ensure-PharmacyWebPm2Registered {
    param(
        [string]$ProjectRoot,
        [scriptblock]$WriteLog = { param($m) Write-Host $m }
    )

    if (-not (Get-Command pm2 -ErrorAction SilentlyContinue)) {
        & $WriteLog "pm2 not found"
        return $false
    }

    $ecosystem = Get-PharmacyWebEcosystemPath -ProjectRoot $ProjectRoot
    if (-not (Test-Path -LiteralPath $ecosystem)) {
        & $WriteLog "Missing ecosystem.config.cjs"
        return $false
    }

    & $WriteLog "Registering pharmacy-web via ecosystem.config.cjs"
    & pm2 start $ecosystem --only pharmacy-web 2>&1 | ForEach-Object { & $WriteLog $_ }
    if ($LASTEXITCODE -ne 0) { return $false }
    & pm2 save 2>$null | Out-Null
    return $true
}

function Test-PharmacyWebPm2OwningPort {
    if (-not (Get-Pm2Online -Name "pharmacy-web")) { return $false }

    $pm2Pid = Get-Pm2Pid -Name "pharmacy-web"
    $listenPid = Get-PortListenerPid -Port 3000
    if (-not $listenPid) { return $false }
    if ($pm2Pid -and ($pm2Pid -ne $listenPid)) { return $false }
    return $true
}

function Wait-PharmacyWebHealthy {
    param(
        [int]$TimeoutSeconds = 60,
        [int]$IntervalSeconds = 3
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        if ((Test-PharmacyWebPm2OwningPort) -and (Test-SiteHealthy)) { return $true }
        Start-Sleep -Seconds $IntervalSeconds
    }
    return $false
}

function Restart-PharmacyWebPm2 {
    param(
        [string]$ProjectRoot,
        [scriptblock]$WriteLog = { param($m) Write-Host $m },
        [switch]$SkipPortCleanup,
        [int]$MaxAttempts = 3
    )

    if (-not (Get-Command pm2 -ErrorAction SilentlyContinue)) {
        & $WriteLog "pm2 not found"
        return $false
    }

    if (-not (Test-Path (Join-Path $ProjectRoot ".env.local"))) {
        & $WriteLog "WARNING: .env.local missing (startup may fail)"
    }

    if (-not (Test-PharmacyWebBuildReady -ProjectRoot $ProjectRoot)) {
        & $WriteLog "Build incomplete. Run: npm run build"
        return $false
    }

    Push-Location $ProjectRoot
    try {
        & node -e "const fs=require('fs'); fs.accessSync('.next/BUILD_ID'); fs.accessSync('.next/prerender-manifest.json');" 2>$null
        if ($LASTEXITCODE -ne 0) {
            & $WriteLog "Build verification failed"
            return $false
        }
    } finally {
        Pop-Location
    }

    for ($attempt = 1; $attempt -le $MaxAttempts; $attempt++) {
        & $WriteLog ("Restart pharmacy-web attempt {0}/{1}" -f $attempt, $MaxAttempts)

        if (-not $SkipPortCleanup) {
            if (-not (Clear-PharmacyWebPort -WriteLog $WriteLog)) {
                $stuck = Get-PortListenerPid -Port 3000
                & $WriteLog ("Port 3000 still held by pid=$stuck (try Administrator)")
                if ($attempt -ge $MaxAttempts) { return $false }
                Start-Sleep -Seconds 2
                continue
            }
        }

        & pm2 delete pharmacy-web 2>$null | Out-Null
        if (-not (Ensure-PharmacyWebPm2Registered -ProjectRoot $ProjectRoot -WriteLog $WriteLog)) {
            if ($attempt -ge $MaxAttempts) { return $false }
            Start-Sleep -Seconds 3
            continue
        }

        if (Wait-PharmacyWebHealthy -TimeoutSeconds 50) {
            & pm2 save 2>$null | Out-Null
            $pm2Pid = Get-Pm2Pid -Name "pharmacy-web"
            $listenPid = Get-PortListenerPid -Port 3000
            & $WriteLog ("pharmacy-web online pm2={0} port={1}" -f $pm2Pid, $listenPid)
            return $true
        }

        & $WriteLog "pharmacy-web not healthy after start"
        & pm2 logs pharmacy-web --lines 15 --nostream 2>$null | ForEach-Object { & $WriteLog $_ }
        $errLog = Join-Path $env:USERPROFILE ".pm2\logs\pharmacy-web-error.log"
        if (Test-Path -LiteralPath $errLog) {
            Get-Content -LiteralPath $errLog -Tail 10 -ErrorAction SilentlyContinue | ForEach-Object { & $WriteLog $_ }
        }
        Start-Sleep -Seconds 2
    }

    return $false
}

function Repair-Pm2AppIfNeeded {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [scriptblock]$WriteLog = { param($m) Write-Host $m },
        [scriptblock]$HealthyCheck = $null
    )

    $healthy = $false
    if ($HealthyCheck) {
        $healthy = & $HealthyCheck
    } else {
        $healthy = Get-Pm2Online -Name $Name
    }

    if ($healthy -and (Get-Pm2Online -Name $Name)) { return $true }

    if (-not (Get-Command pm2 -ErrorAction SilentlyContinue)) {
        & $WriteLog "pm2 not found, cannot repair $Name"
        return $false
    }

    & $WriteLog "Repairing pm2 app: $Name"
    & pm2 resurrect 2>$null | Out-Null
    & pm2 restart $Name --update-env 2>$null | Out-Null
    Start-Sleep -Seconds 4

    if ($HealthyCheck) {
        if (& $HealthyCheck) { return $true }
    } elseif (Get-Pm2Online -Name $Name) {
        return $true
    }

    & $WriteLog "pm2 app still unhealthy: $Name"
    return $false
}

function Start-SiteViaPm2OrRunner {
    param(
        [string]$ProjectRoot,
        [scriptblock]$WriteLog = { param($m) Write-Host $m }
    )

    if (Get-Command pm2 -ErrorAction SilentlyContinue) {
        & $WriteLog "Restarting pharmacy-web (+ cashflow if present) via pm2..."
        if (Restart-PharmacyWebPm2 -ProjectRoot $ProjectRoot -WriteLog $WriteLog) {
            if (Get-Pm2Online -Name "cashflow") {
                & pm2 restart cashflow --update-env 2>$null | Out-Null
            } elseif ((pm2 jlist 2>$null) -match '"name"\s*:\s*"cashflow"') {
                & pm2 restart cashflow --update-env 2>$null | Out-Null
            }
            return
        }
        & $WriteLog "Restart-PharmacyWebPm2 failed"
        return
    }

    & $WriteLog "pm2 not found, starting windows-run-site.ps1..."
    Start-SiteRunner -ProjectRoot $ProjectRoot
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
    $listenerPid = Get-PortListenerPid -Port 3000
    $pm2Pid = Get-Pm2Pid -Name "pharmacy-web"
    if ($listenerPid -and ($pm2Pid -ne $listenerPid)) {
        & $WriteLog ("Port 3000 occupied by non-pm2 pid={0}, force cleanup" -f $listenerPid)
        [void](Stop-PortListenerForce -Port 3000 -WriteLog $WriteLog)
    }

    # 若用 pm2：不要亂殺 node，交給 pm2 restart；否則清掉殘留 runner
    if (-not (Get-Command pm2 -ErrorAction SilentlyContinue)) {
        Stop-ProjectWebProcesses -ProjectRoot $ProjectRoot
    }

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

    Start-SiteViaPm2OrRunner -ProjectRoot $ProjectRoot -WriteLog $WriteLog

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
