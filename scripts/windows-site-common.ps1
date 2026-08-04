# Shared helpers for site start / watchdog / repair (Docker + PM2)

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

function Test-CashflowHealthy {
    # 金流本機常見埠：8443（外網 Funnel）或 3001
    if (Test-PortListening 8443) {
        if (Test-HttpOk -Uri "http://127.0.0.1:8443/" -TimeoutSec 5) { return $true }
        # 埠有在聽但 HTTP 失敗仍視為「進程可能活著」，交由 pm2 restart 再判
        return $true
    }
    if (Test-PortListening 3001) {
        return (Test-HttpOk -Uri "http://127.0.0.1:3001/" -TimeoutSec 5)
    }
    return $false
}

function Test-Pm2AppExists([string]$Name) {
    if (-not (Get-Command pm2 -ErrorAction SilentlyContinue)) { return $false }
    $j = & pm2 jlist 2>$null
    if (-not $j) { return $false }
    try {
        $apps = $j | ConvertFrom-Json
        $app = $apps | Where-Object { $_.name -eq $Name } | Select-Object -First 1
        return [bool]$app
    } catch {
        return (($j | Out-String) -match ('"name"\s*:\s*"' + [regex]::Escape($Name) + '"'))
    }
}

function Get-Pm2AppsByName([string]$Name) {
    if (-not (Get-Command pm2 -ErrorAction SilentlyContinue)) { return @() }
    $j = & pm2 jlist 2>$null
    if (-not $j) { return @() }
    try {
        $apps = @($j | ConvertFrom-Json)
        return @($apps | Where-Object { $_.name -eq $Name })
    } catch {
        return @()
    }
}

function Get-Pm2Online([string]$Name) {
    $apps = @(Get-Pm2AppsByName -Name $Name)
    if ($apps.Count -eq 0) { return $false }
    return [bool]($apps | Where-Object { $_.pm2_env.status -eq "online" } | Select-Object -First 1)
}

# 刪掉同名多餘 PM2 行程，只留一筆（避免 npm／node 疊加）
function Repair-Pm2NameDuplicates {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [scriptblock]$WriteLog = { param($m) Write-Host $m }
    )

    $apps = @(Get-Pm2AppsByName -Name $Name)
    if ($apps.Count -le 1) { return 0 }

    & $WriteLog ("PM2 duplicate '$Name' x{0} - keeping one, deleting extras" -f $apps.Count)
    $keep = $apps | Where-Object { $_.pm2_env.status -eq "online" } | Select-Object -First 1
    if (-not $keep) { $keep = $apps[0] }
    foreach ($app in $apps) {
        if ($app.pm_id -eq $keep.pm_id) { continue }
        & pm2 delete $app.pm_id 2>$null | Out-Null
    }
    return ($apps.Count - 1)
}

function Get-ProcessDescendantIds([int]$RootPid) {
    $result = New-Object System.Collections.Generic.List[int]
    if ($RootPid -le 0) { return @() }
    $result.Add($RootPid) | Out-Null
    $queue = New-Object System.Collections.Generic.Queue[int]
    $queue.Enqueue($RootPid)
    $all = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Select-Object ProcessId, ParentProcessId)
    while ($queue.Count -gt 0) {
        $parent = $queue.Dequeue()
        foreach ($child in ($all | Where-Object { $_.ParentProcessId -eq $parent })) {
            $cid = [int]$child.ProcessId
            if (-not $result.Contains($cid)) {
                $result.Add($cid) | Out-Null
                $queue.Enqueue($cid)
            }
        }
    }
    return @($result)
}

function Get-Pm2ProtectedPids {
    $protected = @{}
    if (-not (Get-Command pm2 -ErrorAction SilentlyContinue)) { return $protected }
    try {
        $apps = @((& pm2 jlist 2>$null) | ConvertFrom-Json)
        foreach ($a in $apps) {
            $root = 0
            if ($a.pid) { $root = [int]$a.pid }
            if ($root -gt 0) {
                foreach ($pid in (Get-ProcessDescendantIds -RootPid $root)) {
                    $protected[$pid] = $true
                }
            }
        }
    } catch { }
    return $protected
}

# 透過 cmd 呼叫 pm2，避免 PowerShell 吃掉 "--" 導致變成 Script not found: ...\start
function Invoke-Pm2ViaCmd {
    param([Parameter(Mandatory = $true)][string]$Pm2Args)
    $cmdLine = "pm2 $Pm2Args"
    & cmd.exe /c $cmdLine
    return ($LASTEXITCODE -eq 0)
}

# 用 next 二進位啟動排班（Windows 上比 pm2 start npm -- start 可靠）
function Start-PharmacyWebPm2Fresh {
    param(
        [Parameter(Mandatory = $true)][string]$ProjectRoot,
        [scriptblock]$WriteLog = { param($m) Write-Host $m }
    )

    if (Test-Pm2AppExists -Name "pharmacy-web") {
        & pm2 delete pharmacy-web 2>$null | Out-Null
    }

    $nextBin = Join-Path $ProjectRoot "node_modules\next\dist\bin\next"
    Push-Location $ProjectRoot
    try {
        if (Test-Path -LiteralPath $nextBin) {
            & $WriteLog "pm2 start next bin (pharmacy-web)"
            $quoted = '"' + $nextBin + '"'
            $cwdQ = '"' + $ProjectRoot + '"'
            [void](Invoke-Pm2ViaCmd -Pm2Args "start $quoted --name pharmacy-web --cwd $cwdQ -- start")
        } else {
            & $WriteLog "pm2 start npm (pharmacy-web) via cmd"
            $cwdQ = '"' + $ProjectRoot + '"'
            [void](Invoke-Pm2ViaCmd -Pm2Args "start npm --name pharmacy-web --cwd $cwdQ -- start")
        }
    } finally {
        Pop-Location
    }
    Start-Sleep -Seconds 5
    & pm2 save 2>$null | Out-Null
    return (Get-Pm2Online -Name "pharmacy-web")
}

# 金流專案路徑：環境變數 CASHFLOW_ROOT 或常見本機目錄
function Get-CashflowAppRoot {
    $candidates = @()
    if ($env:CASHFLOW_ROOT) { $candidates += $env:CASHFLOW_ROOT }
    $candidates += @(
        "C:\cash-flow-app",
        "C:\Cash-Flow-App",
        "C:\cashflow",
        "C:\Cashflow"
    )
    foreach ($p in $candidates) {
        if ($p -and (Test-Path -LiteralPath $p)) {
            if (Test-Path -LiteralPath (Join-Path $p "package.json")) { return $p }
        }
    }
    return $null
}

# 寫入暫存 ecosystem，固定 PORT=8443，避免 npm start 沒帶埠而秒退
function Start-CashflowPm2Fresh {
    param([scriptblock]$WriteLog = { param($m) Write-Host $m })

    $root = Get-CashflowAppRoot
    if (-not $root) {
        & $WriteLog "cashflow app root not found (set CASHFLOW_ROOT or install at C:\cash-flow-app)"
        return $false
    }

    & $WriteLog ("Starting cashflow from {0}" -f $root)

    if (Test-Pm2AppExists -Name "cashflow") {
        & pm2 delete cashflow 2>$null | Out-Null
    }

    $nextBin = Join-Path $root "node_modules\next\dist\bin\next"
    $pkg = Join-Path $root "package.json"
    $hasNpmStart = $false
    if (Test-Path -LiteralPath $pkg) {
        try {
            $pkgJson = Get-Content -LiteralPath $pkg -Raw -Encoding UTF8 | ConvertFrom-Json
            if ($pkgJson.scripts -and $pkgJson.scripts.start) { $hasNpmStart = $true }
        } catch { }
    }

    $ecoDir = Join-Path $env:TEMP "yaosheng-pm2"
    if (-not (Test-Path -LiteralPath $ecoDir)) {
        New-Item -ItemType Directory -Path $ecoDir -Force | Out-Null
    }
    $ecoPath = Join-Path $ecoDir "cashflow.ecosystem.cjs"
    $rootEsc = $root.Replace("\", "\\")

    if (Test-Path -LiteralPath $nextBin) {
        $scriptEsc = $nextBin.Replace("\", "\\")
        $eco = @"
module.exports = {
  apps: [{
    name: 'cashflow',
    cwd: '$rootEsc',
    script: '$scriptEsc',
    args: 'start -p 8443',
    env: { PORT: '8443', NODE_ENV: 'production' },
    max_restarts: 20,
    min_uptime: 5000
  }]
};
"@
    } elseif ($hasNpmStart) {
        $eco = @"
module.exports = {
  apps: [{
    name: 'cashflow',
    cwd: '$rootEsc',
    script: 'npm',
    args: 'start',
    interpreter: 'none',
    env: { PORT: '8443', NODE_ENV: 'production' },
    max_restarts: 20,
    min_uptime: 5000
  }]
};
"@
    } else {
        $serverJs = @(
            (Join-Path $root "server.js"),
            (Join-Path $root "index.js"),
            (Join-Path $root "dist\server.js")
        ) | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
        if (-not $serverJs) {
            & $WriteLog "cashflow: no start script / next / server.js found"
            return $false
        }
        $scriptEsc = $serverJs.Replace("\", "\\")
        $eco = @"
module.exports = {
  apps: [{
    name: 'cashflow',
    cwd: '$rootEsc',
    script: '$scriptEsc',
    env: { PORT: '8443', NODE_ENV: 'production' },
    max_restarts: 20,
    min_uptime: 5000
  }]
};
"@
    }

    Set-Content -LiteralPath $ecoPath -Value $eco -Encoding ASCII
    & $WriteLog ("pm2 start ecosystem: {0}" -f $ecoPath)
    [void](Invoke-Pm2ViaCmd -Pm2Args ("start `"" + $ecoPath + "`""))

    Start-Sleep -Seconds 6
    [void](Repair-Pm2NameDuplicates -Name "cashflow" -WriteLog $WriteLog)
    & pm2 save 2>$null | Out-Null

    if (Test-CashflowHealthy -or (Get-Pm2Online -Name "cashflow")) {
        & $WriteLog "cashflow started OK"
        return $true
    }
    & $WriteLog "cashflow start attempted but not healthy - run: pm2 logs cashflow --lines 50"
    return (Get-Pm2Online -Name "cashflow")
}

# 強制釋放埠（EADDRINUSE 救援）：刪掉佔用 PID，不因「PM2 有同名」就跳過
function Clear-ListeningPorts {
    param(
        [int[]]$Ports = @(3000, 8443),
        [scriptblock]$WriteLog = { param($m) Write-Host $m }
    )

    foreach ($port in $Ports) {
        if (-not (Test-PortListening $port)) { continue }
        $listenPids = netstat -ano | Select-String ":$port\s" | Select-String "LISTENING" | ForEach-Object {
            ($_ -split '\s+')[-1]
        } | Select-Object -Unique
        foreach ($procIdText in $listenPids) {
            $procId = 0
            if (-not [int]::TryParse("$procIdText", [ref]$procId)) { continue }
            if ($procId -le 0) { continue }
            & $WriteLog ("Free port :{0} kill PID {1}" -f $port, $procId)
            try { & taskkill.exe /PID $procId /T /F 2>$null | Out-Null } catch {
                Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
            }
        }
    }
    Start-Sleep -Seconds 2
}

# 清掉非 PM2 的殘留 runner；佔埠殭屍在「PM2 非 online」時也清掉
function Stop-OrphanWebStacks {
    param(
        [string]$ProjectRoot,
        [int[]]$Ports = @(3000, 8443),
        [scriptblock]$WriteLog = { param($m) Write-Host $m }
    )

    $runners = Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" -ErrorAction SilentlyContinue |
        Where-Object {
            $_.CommandLine -like "*windows-run-site.ps1*" -or
            $_.CommandLine -like "*windows-start-web.ps1*" -or
            $_.CommandLine -like "*start-local.ps1*"
        }
    foreach ($r in @($runners)) {
        & $WriteLog ("Stopping orphan runner PID {0}" -f $r.ProcessId)
        try { & taskkill.exe /PID $r.ProcessId /T /F 2>$null | Out-Null } catch {
            Stop-Process -Id $r.ProcessId -Force -ErrorAction SilentlyContinue
        }
    }

    $protected = Get-Pm2ProtectedPids
    # 只有「真的 online」才保護埠；errored/stopped 時必須清掉佔埠殭屍（EADDRINUSE）
    $skipPorts = @{}
    if ((Get-Pm2Online -Name "pharmacy-web") -and (Test-SiteHealthy)) { $skipPorts[3000] = $true }
    if ((Get-Pm2Online -Name "cashflow") -and (Test-CashflowHealthy)) {
        $skipPorts[8443] = $true
        $skipPorts[3001] = $true
    }

    foreach ($port in $Ports) {
        if ($skipPorts.ContainsKey($port)) {
            & $WriteLog ("Skip killing :{0} (PM2 healthy)" -f $port)
            continue
        }
        if (-not (Test-PortListening $port)) { continue }
        $listenPids = netstat -ano | Select-String ":$port\s" | Select-String "LISTENING" | ForEach-Object {
            ($_ -split '\s+')[-1]
        } | Select-Object -Unique
        foreach ($procIdText in $listenPids) {
            $procId = 0
            if (-not [int]::TryParse("$procIdText", [ref]$procId)) { continue }
            if ($procId -le 0) { continue }
            if ($protected.ContainsKey($procId) -and (Get-Pm2Online -Name "pharmacy-web" -or Get-Pm2Online -Name "cashflow")) {
                # protected but app not healthy: still kill to break EADDRINUSE loop
            }
            & $WriteLog ("Killing listener on :{0} PID {1}" -f $port, $procId)
            try { & taskkill.exe /PID $procId /T /F 2>$null | Out-Null } catch {
                Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
            }
        }
    }
    Start-Sleep -Seconds 1
}

# 乾淨重啟：去重 -> restart；僅在完全沒有時才 resurrect / 新建（避免 npm 疊加）
function Restart-Pm2AppClean {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [scriptblock]$WriteLog = { param($m) Write-Host $m },
        [string]$StartCwd = ""
    )

    if (-not (Get-Command pm2 -ErrorAction SilentlyContinue)) {
        & $WriteLog "pm2 not found"
        return $false
    }

    [void](Repair-Pm2NameDuplicates -Name $Name -WriteLog $WriteLog)

    if (Test-Pm2AppExists -Name $Name) {
        & $WriteLog "pm2 restart $Name (no resurrect - avoid stacking)"
        # 不要先 stop 再 restart：Windows 上 stop 後子進程 PID 對不齊容易掛掉
        [void](Invoke-Pm2ViaCmd -Pm2Args "restart $Name --update-env")
        Start-Sleep -Seconds 4
        if (Get-Pm2Online -Name $Name) { return $true }

        & $WriteLog "restart failed - delete and start once"
        & pm2 delete $Name 2>$null | Out-Null
        Start-Sleep -Seconds 1
    } else {
        & $WriteLog "pm2 app missing: try resurrect once for $Name"
        & pm2 resurrect 2>$null | Out-Null
        [void](Repair-Pm2NameDuplicates -Name $Name -WriteLog $WriteLog)
        if (Test-Pm2AppExists -Name $Name) {
            [void](Invoke-Pm2ViaCmd -Pm2Args "restart $Name --update-env")
            Start-Sleep -Seconds 4
            if (Get-Pm2Online -Name $Name) { return $true }
            & pm2 delete $Name 2>$null | Out-Null
        }
    }

    if ($Name -eq "pharmacy-web" -and $StartCwd) {
        return (Start-PharmacyWebPm2Fresh -ProjectRoot $StartCwd -WriteLog $WriteLog)
    }

    if ($Name -eq "cashflow") {
        return (Start-CashflowPm2Fresh -WriteLog $WriteLog)
    }

    & pm2 start $Name 2>$null | Out-Null
    Start-Sleep -Seconds 3
    [void](Repair-Pm2NameDuplicates -Name $Name -WriteLog $WriteLog)
    return (Get-Pm2Online -Name $Name)
}

function Restart-DualSitesClean {
    param(
        [string]$ProjectRoot,
        [scriptblock]$WriteLog = { param($m) Write-Host $m }
    )

    # 先停 PM2 再強制清埠，避免 EADDRINUSE 重啟死循環
    & $WriteLog "pm2 delete pharmacy-web / cashflow then free :3000 :8443"
    if (Test-Pm2AppExists -Name "pharmacy-web") { & pm2 delete pharmacy-web 2>$null | Out-Null }
    if (Test-Pm2AppExists -Name "cashflow") { & pm2 delete cashflow 2>$null | Out-Null }
    Clear-ListeningPorts -Ports @(3000, 8443) -WriteLog $WriteLog

    Stop-OrphanWebStacks -ProjectRoot $ProjectRoot -Ports @(3000, 8443) -WriteLog $WriteLog

    $okPharmacy = Start-PharmacyWebPm2Fresh -ProjectRoot $ProjectRoot -WriteLog $WriteLog

    $okCashflow = $true
    if (Get-CashflowAppRoot) {
        $okCashflow = Start-CashflowPm2Fresh -WriteLog $WriteLog
    } else {
        & $WriteLog "cashflow folder not found - skip (start manually later)"
    }

    & pm2 save 2>$null | Out-Null
    return ($okPharmacy -and $okCashflow)
}

function Repair-Pm2AppIfNeeded {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [scriptblock]$WriteLog = { param($m) Write-Host $m },
        [scriptblock]$HealthyCheck = $null
    )

    [void](Repair-Pm2NameDuplicates -Name $Name -WriteLog $WriteLog)

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

    & $WriteLog "Repairing pm2 app cleanly: $Name"
    $ok = Restart-Pm2AppClean -Name $Name -WriteLog $WriteLog
    & pm2 save 2>$null | Out-Null

    if ($HealthyCheck) {
        if ((& $HealthyCheck) -and $ok) { return $true }
        if (& $HealthyCheck) {
            & $WriteLog "$Name port healthy after repair (pm2 status may lag)"
            return $true
        }
    } elseif ($ok) {
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
        [void](Restart-DualSitesClean -ProjectRoot $ProjectRoot -WriteLog $WriteLog)
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
    if (Get-Command pm2 -ErrorAction SilentlyContinue) {
        & $WriteLog "Free :3000 then restart pharmacy-web"
        if (Test-Pm2AppExists -Name "pharmacy-web") {
            & pm2 delete pharmacy-web 2>$null | Out-Null
        }
        Clear-ListeningPorts -Ports @(3000) -WriteLog $WriteLog
        [void](Start-PharmacyWebPm2Fresh -ProjectRoot $ProjectRoot -WriteLog $WriteLog)
    } else {
        Stop-ProjectWebProcesses -ProjectRoot $ProjectRoot
        Start-SiteRunner -ProjectRoot $ProjectRoot
    }

    $buildIdPath = Join-Path $ProjectRoot ".next\BUILD_ID"
    if (-not (Test-Path -LiteralPath $buildIdPath)) {
        & $WriteLog "BUILD_ID missing, running npm run build..."
        try {
            Invoke-NpmBuild -ProjectRoot $ProjectRoot
            if (Get-Command pm2 -ErrorAction SilentlyContinue) {
                [void](Start-PharmacyWebPm2Fresh -ProjectRoot $ProjectRoot -WriteLog $WriteLog)
            }
        } catch {
            & $WriteLog "npm run build failed"
            return $false
        }
    }

    # 最多等約 45 秒成為健康（每 5 秒用 curl 探一次）
    for ($i = 1; $i -le 9; $i++) {
        Start-Sleep -Seconds 5
        if (Test-SiteHealthy) {
            & $WriteLog "Site repaired"
            return $true
        }
    }

    & $WriteLog "Site repair failed (will retry next minute)"
    return $false
}
