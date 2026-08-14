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

function Get-CashflowHealthPort {
    param([string]$ProjectRoot)

    $defaultPort = 5000
    if (-not $ProjectRoot) { return $defaultPort }

    $configPath = Get-CashflowBootstrapConfigPath -ProjectRoot $ProjectRoot
    if (-not (Test-Path -LiteralPath $configPath)) { return $defaultPort }

    try {
        $cfg = (Get-Content -LiteralPath $configPath -Raw -ErrorAction Stop) | ConvertFrom-Json
        $port = 0
        if ($cfg.port -and [int]::TryParse([string]$cfg.port, [ref]$port) -and $port -gt 0) {
            return $port
        }
    } catch {
        # ignore invalid bootstrap
    }
    return $defaultPort
}

function Test-CashflowHealthy {
    param([string]$ProjectRoot = "")

    $ports = @()
    if ($ProjectRoot) {
        $ports += Get-CashflowHealthPort -ProjectRoot $ProjectRoot
    } else {
        $ports += 5000
    }
    # 舊版部署可能仍直接聽 8443 或 3001
    foreach ($legacy in @(8443, 3001)) {
        if ($ports -notcontains $legacy) { $ports += $legacy }
    }

    foreach ($port in $ports) {
        if (-not (Test-PortListening $port)) { continue }
        if (Test-HttpOk -Uri "http://127.0.0.1:$port/" -TimeoutSec 5) { return $true }
        # 埠已開但 HTTP 探測失敗時仍視為程序存活（避免誤判重啟）
        return $true
    }
    return $false
}

function Get-FunnelStatusJson {
    if (-not (Get-Command tailscale -ErrorAction SilentlyContinue)) { return $null }
    $raw = (tailscale funnel status --json 2>$null | Out-String)
    if (-not $raw) { return $null }
    try {
        return ($raw | ConvertFrom-Json)
    } catch {
        return $null
    }
}

function Test-FunnelProxyConfigured {
    param(
        [int]$LocalPort,
        [int]$PublicHttpsPort = 0
    )

    $status = Get-FunnelStatusJson
    if (-not $status) {
        # 後備：純文字 status（新版 CLI 常只印 443，故僅作最後手段）
        $text = (tailscale funnel status 2>$null | Out-String)
        if (-not $text) { return $false }
        if ($text -notmatch "Funnel on") { return $false }
        return ($text -match ("127\.0\.0\.1:{0}" -f $LocalPort))
    }

    $localNeedle = "127.0.0.1:$LocalPort"
    $allow = $status.AllowFunnel
    $web = $status.Web
    if (-not $web) { return $false }

    foreach ($hostPort in @($web.PSObject.Properties.Name)) {
        if ($PublicHttpsPort -gt 0 -and $hostPort -notmatch (":{0}$" -f $PublicHttpsPort)) {
            continue
        }
        $handlers = $web.$hostPort.Handlers
        if (-not $handlers) { continue }
        foreach ($path in @($handlers.PSObject.Properties.Name)) {
            $proxy = [string]$handlers.$path.Proxy
            if ($proxy -and $proxy.Contains($localNeedle)) {
                if ($allow) {
                    $allowed = $false
                    foreach ($af in @($allow.PSObject.Properties.Name)) {
                        if ($af -eq $hostPort -and $allow.$af) { $allowed = $true; break }
                    }
                    if (-not $allowed) { continue }
                }
                return $true
            }
        }
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

function Get-CashflowBootstrapConfigPath {
    param([string]$ProjectRoot)
    return Join-Path $ProjectRoot "data\ops\cashflow-bootstrap.json"
}

function Ensure-CashflowPm2Registered {
    param(
        [string]$ProjectRoot,
        [scriptblock]$WriteLog = { param($m) Write-Host $m }
    )

    if (-not (Get-Command pm2 -ErrorAction SilentlyContinue)) {
        & $WriteLog "pm2 not found, cannot register cashflow"
        return $false
    }

    if (Get-Pm2Online -Name "cashflow") { return $true }

    $configPath = Get-CashflowBootstrapConfigPath -ProjectRoot $ProjectRoot
    if (-not (Test-Path -LiteralPath $configPath)) {
        & $WriteLog "cashflow bootstrap config missing; skip auto-register"
        return $false
    }

    try {
        $raw = Get-Content -LiteralPath $configPath -Raw -ErrorAction Stop
        $cfg = $raw | ConvertFrom-Json
    } catch {
        & $WriteLog ("cashflow bootstrap config invalid: {0}" -f $_.Exception.Message)
        return $false
    }

    if (-not $cfg.script) {
        & $WriteLog "cashflow bootstrap config has no script path"
        return $false
    }

    $scriptPath = [string]$cfg.script
    if (-not (Test-Path -LiteralPath $scriptPath)) {
        & $WriteLog ("cashflow script not found: {0}" -f $scriptPath)
        return $false
    }

    $cwd = if ($cfg.cwd) { [string]$cfg.cwd } else { Split-Path -Parent $scriptPath }
    if (-not (Test-Path -LiteralPath $cwd)) {
        & $WriteLog ("cashflow cwd not found: {0}" -f $cwd)
        return $false
    }

    $args = @()
    if ($cfg.args) {
        foreach ($a in $cfg.args) { $args += [string]$a }
    }

    $port = 5000
    if ($cfg.port) {
        $parsed = 0
        if ([int]::TryParse([string]$cfg.port, [ref]$parsed) -and $parsed -gt 0) { $port = $parsed }
    }
    $env:PORT = [string]$port

    $argLine = ""
    if ($args.Count -gt 0) {
        $argLine = ($args | ForEach-Object { '"{0}"' -f $_.Replace('"', '\"') }) -join " "
    }
    $cmd = if ($argLine) {
        'pm2 start "{0}" --name cashflow --cwd "{1}" --update-env -- {2}' -f $scriptPath, $cwd, $argLine
    } else {
        'pm2 start "{0}" --name cashflow --cwd "{1}" --update-env' -f $scriptPath, $cwd
    }

    & $WriteLog "Registering cashflow via bootstrap config"
    cmd.exe /c $cmd 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) {
        & $WriteLog "cashflow pm2 start failed"
        return $false
    }

    pm2 save 2>$null | Out-Null
    Start-Sleep -Seconds 2
    return (Get-Pm2Online -Name "cashflow")
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
    $env:PORT = "3000"
    $prevEap = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    $output = & pm2 start $ecosystem --only pharmacy-web --update-env 2>&1
    $exitCode = $LASTEXITCODE
    $ErrorActionPreference = $prevEap
    if ($exitCode -ne 0) {
        $output | ForEach-Object { & $WriteLog $_ }
        return $false
    }
    & pm2 save 2>$null | Out-Null
    return $true
}

function Test-ProcessInTree {
    param(
        [int]$AncestorPid,
        [int]$CandidatePid
    )

    if ($AncestorPid -le 0 -or $CandidatePid -le 0) { return $false }
    if ($AncestorPid -eq $CandidatePid) { return $true }

    $current = $CandidatePid
    for ($i = 0; $i -lt 12; $i++) {
        $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$current" -ErrorAction SilentlyContinue
        if (-not $proc) { return $false }
        $parent = 0
        if (-not [int]::TryParse([string]$proc.ParentProcessId, [ref]$parent) -or $parent -le 0) {
            return $false
        }
        if ($parent -eq $AncestorPid) { return $true }
        if ($parent -eq $current) { return $false }
        $current = $parent
    }
    return $false
}

function Test-PharmacyWebPm2OwningPort {
    if (-not (Get-Pm2Online -Name "pharmacy-web")) { return $false }

    $pm2Pid = Get-Pm2Pid -Name "pharmacy-web"
    $listenPid = Get-PortListenerPid -Port 3000
    if (-not $listenPid) { return $false }
    if (-not $pm2Pid) { return $false }
    # ecosystem 用 wrapper 啟動 next；聽埠的是子進程，不可要求 PID 完全相等
    return (Test-ProcessInTree -AncestorPid $pm2Pid -CandidatePid $listenPid)
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

    # 避免同一 PowerShell 曾設 PORT=5000（現金帳）導致 Next 聽錯埠
    $env:PORT = "3000"

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

    $didDeepRepair = $false
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
        $pm2LogTail = (& pm2 logs pharmacy-web --lines 20 --nostream 2>$null | Out-String)
        if ($pm2LogTail) {
            $pm2LogTail -split "`r?`n" | ForEach-Object {
                if ($_ -and $_.Trim().Length -gt 0) { & $WriteLog $_ }
            }
        }
        $errLog = Join-Path $env:USERPROFILE ".pm2\logs\pharmacy-web-error.log"
        $errTail = ""
        if (Test-Path -LiteralPath $errLog) {
            $errTail = (Get-Content -LiteralPath $errLog -Tail 80 -ErrorAction SilentlyContinue | Out-String)
            if ($errTail) {
                $errTail -split "`r?`n" | ForEach-Object {
                    if ($_ -and $_.Trim().Length -gt 0) { & $WriteLog $_ }
                }
            }
        }

        # 自動自癒：Next 在 Windows 偶發 MODULE_NOT_FOUND（.next 或 node_modules 局部損壞）
        if (-not $didDeepRepair -and (($pm2LogTail -match "MODULE_NOT_FOUND") -or ($errTail -match "MODULE_NOT_FOUND") -or ($errTail -match "Cannot find module"))) {
            $didDeepRepair = $true
            & $WriteLog "Detected MODULE_NOT_FOUND. Running deep repair: stop -> clear .next -> npm install -> build"
            try {
                & pm2 stop pharmacy-web 2>$null | Out-Null
                Stop-ProjectWebProcesses -ProjectRoot $ProjectRoot
                Clear-NextBuild -ProjectRoot $ProjectRoot
                Push-Location $ProjectRoot
                try {
                    $npm = "C:\Program Files\nodejs\npm.cmd"
                    & $npm install
                    if ($LASTEXITCODE -ne 0) { throw "npm install failed with exit code $LASTEXITCODE" }
                } finally {
                    Pop-Location
                }
                Invoke-NpmBuild -ProjectRoot $ProjectRoot
                & $WriteLog "Deep repair completed; retrying startup"
            } catch {
                & $WriteLog ("Deep repair failed: {0}" -f $_.Exception.Message)
            }
        }
        Start-Sleep -Seconds 2
    }

    return $false
}

function Repair-Pm2AppIfNeeded {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [string]$ProjectRoot = "",
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

    if ($Name -eq "pharmacy-web" -and $ProjectRoot) {
        & $WriteLog "Repairing pharmacy-web via Restart-PharmacyWebPm2"
        return (Restart-PharmacyWebPm2 -ProjectRoot $ProjectRoot -WriteLog $WriteLog)
    }

    if ($Name -eq "cashflow" -and $ProjectRoot) {
        if (-not (Test-Pm2AppExists -Name "cashflow")) {
            [void](Ensure-CashflowPm2Registered -ProjectRoot $ProjectRoot -WriteLog $WriteLog)
        }
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
        & $WriteLog "Restarting pharmacy-web via pm2 (cashflow left alone if healthy)..."
        if (Restart-PharmacyWebPm2 -ProjectRoot $ProjectRoot -WriteLog $WriteLog) {
            if (Test-Pm2AppExists -Name "cashflow") {
                [void](Repair-Pm2AppIfNeeded -Name "cashflow" -ProjectRoot $ProjectRoot -HealthyCheck {
                    Test-CashflowHealthy -ProjectRoot $ProjectRoot
                } -WriteLog $WriteLog)
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

    if ((Test-SiteHealthy) -and (Test-PharmacyWebPm2OwningPort)) { return $true }

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
