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

<#
  每分鐘監測用觸發器：重開機後仍會繼續跑。
  舊版只用 -Once + Repetition，重開機後常停止重複；改為 Daily 續跑 + AtStartup/AtLogon 喚醒。
#>
function New-YaoshengMinuteWatchdogTriggers {
    $repSource = New-ScheduledTaskTrigger -Once -At "00:00" `
        -RepetitionInterval (New-TimeSpan -Minutes 1) `
        -RepetitionDuration (New-TimeSpan -Hours 23 -Minutes 59)

    $daily = New-ScheduledTaskTrigger -Daily -At "00:00"
    $daily.Repetition = $repSource.Repetition

    $startup = New-ScheduledTaskTrigger -AtStartup
    $startup.Delay = "PT5M"

    $logon = New-ScheduledTaskTrigger -AtLogOn
    $logon.Delay = "PT2M"

    return @($daily, $startup, $logon)
}

function Enable-YaoshengWatchdogTask {
    param(
        [string]$TaskName = "YaoshengPharmacyWatchdog",
        [scriptblock]$WriteLog = $null
    )
    $t = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    if (-not $t) {
        if ($WriteLog) { & $WriteLog "Watchdog task missing: $TaskName" }
        return $false
    }
    Enable-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue | Out-Null
    Start-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    if ($WriteLog) { & $WriteLog "Watchdog task enabled/started: $TaskName (state=$($t.State))" }
    return $true
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
        [int]$TimeoutSeconds = 180,
        [scriptblock]$WriteLog = $null
    )

    $lockFile = Get-BuildLockPath -ProjectRoot $ProjectRoot
    if (-not (Test-Path -LiteralPath $lockFile)) { return $true }

    [void](Clear-StaleBuildLock -ProjectRoot $ProjectRoot -WriteLog $(if ($WriteLog) { $WriteLog } else { { param($m) } }))
    if (-not (Test-Path -LiteralPath $lockFile)) { return $true }

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while (Test-Path -LiteralPath $lockFile) {
        if ((Get-Date) -ge $deadline) {
            # 逾時再清一次殘留鎖（常見：update 中斷留下 data\logs\.building）
            [void](Clear-StaleBuildLock -ProjectRoot $ProjectRoot -MaxAgeMinutes 0 -WriteLog $(if ($WriteLog) { $WriteLog } else { { param($m) } }))
            return (-not (Test-Path -LiteralPath $lockFile))
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

    if (-not (Wait-BuildLockRelease -ProjectRoot $ProjectRoot -TimeoutSeconds 300 -WriteLog { param($m) Write-Host "  $m" })) {
        throw "Another build is already running for over 5 minutes."
    }

    try {
        New-Item -ItemType File -Path $lockFile -ErrorAction Stop | Out-Null

        # 先停 PM2，避免 build 期間 autorestart 或與 next start 同時讀寫 .next
        if (Get-Pm2Command) {
            [void](Invoke-Pm2Safe -Pm2Args @("stop", "pharmacy-web") -OnlyIfAppExists "pharmacy-web")
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

function Get-TailscaleCommand {
    $cmd = Get-Command tailscale -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    $candidates = @(
        "C:\Program Files\Tailscale\tailscale.exe",
        "${env:ProgramFiles(x86)}\Tailscale\tailscale.exe",
        "$env:LOCALAPPDATA\Tailscale\tailscale.exe"
    )
    foreach ($p in $candidates) {
        if ($p -and (Test-Path -LiteralPath $p)) { return $p }
    }
    return $null
}

function Get-FunnelPublicBaseUrl {
    $ts = Get-TailscaleCommand
    if ($ts) {
        $text = (& $ts funnel status 2>$null | Out-String)
        if ($text -match '(https://[a-z0-9-]+\.tail[a-z0-9]+\.ts\.net)') {
            return $Matches[1].TrimEnd("/")
        }
        $json = (& $ts funnel status --json 2>$null | Out-String)
        if ($json -match '(https://[a-z0-9-]+\.tail[a-z0-9]+\.ts\.net)') {
            return $Matches[1].TrimEnd("/")
        }
    }
    return "https://chiaho-pharmacy.tail7f62d0.ts.net"
}

function Get-TailscaleBackendState {
    $ts = Get-TailscaleCommand
    if (-not $ts) { return "missing" }
    try {
        $raw = (& $ts status --json 2>$null | Out-String)
        if ([string]::IsNullOrWhiteSpace($raw)) { return "unknown" }
        $start = $raw.IndexOf("{")
        $end = $raw.LastIndexOf("}")
        if ($start -lt 0 -or $end -le $start) { return "unknown" }
        $obj = ConvertFrom-Json -InputObject $raw.Substring($start, $end - $start + 1)
        if ($obj.BackendState) { return [string]$obj.BackendState }
        return "unknown"
    } catch {
        return "unknown"
    }
}

function Invoke-FunnelPublicProbe {
    param(
        [string]$Path = "/login",
        [int]$HttpsPort = 443,
        [int]$TimeoutSec = 10
    )
    $base = Get-FunnelPublicBaseUrl
    if (-not $base) { return $false }
    if ($HttpsPort -eq 443) {
        $uri = "$base$Path"
    } else {
        $uri = "{0}:{1}{2}" -f $base, $HttpsPort, $Path
    }
    try {
        $out = & curl.exe -s -o NUL -w "%{http_code}" --connect-timeout 5 --max-time $TimeoutSec --http1.1 $uri 2>$null
        if ($LASTEXITCODE -ne 0) { return $false }
        $code = ("$out").Trim()
        return ($code -eq "200" -or $code -eq "204" -or $code -eq "301" -or $code -eq "302" -or $code -eq "304" -or $code -eq "307" -or $code -eq "308")
    } catch {
        return $false
    }
}

# Lightweight public probe: /api/health first, then /login. Retry once on failure.
function Test-FunnelPublicOk {
    param(
        [string]$Path = "",
        [int]$HttpsPort = 443,
        [int]$TimeoutSec = 10,
        [switch]$NoRetry
    )

    $ok = $false
    if ($Path) {
        $ok = Invoke-FunnelPublicProbe -Path $Path -HttpsPort $HttpsPort -TimeoutSec $TimeoutSec
    } else {
        $ok = Invoke-FunnelPublicProbe -Path "/api/health" -HttpsPort $HttpsPort -TimeoutSec $TimeoutSec
        if (-not $ok) {
            $ok = Invoke-FunnelPublicProbe -Path "/login" -HttpsPort $HttpsPort -TimeoutSec ([Math]::Max($TimeoutSec, 12))
        }
    }
    if ($ok) { return $true }
    if ($NoRetry) { return $false }
    Start-Sleep -Seconds 2
    if ($Path) {
        return [bool](Invoke-FunnelPublicProbe -Path $Path -HttpsPort $HttpsPort -TimeoutSec $TimeoutSec)
    }
    $ok = Invoke-FunnelPublicProbe -Path "/api/health" -HttpsPort $HttpsPort -TimeoutSec $TimeoutSec
    if ($ok) { return $true }
    return [bool](Invoke-FunnelPublicProbe -Path "/login" -HttpsPort $HttpsPort -TimeoutSec ([Math]::Max($TimeoutSec, 12)))
}

function Test-FunnelRoutesConfigured {
    $phCfg = (Test-FunnelProxyConfigured -LocalPort 3000 -PublicHttpsPort 443) -or (Test-FunnelProxyConfigured -LocalPort 3000)
    $cfCfg = (Test-FunnelProxyConfigured -LocalPort 5000 -PublicHttpsPort 8443) -or (Test-FunnelProxyConfigured -LocalPort 5000)
    return [pscustomobject]@{
        Pharmacy = [bool]$phCfg
        Cashflow = [bool]$cfCfg
        Ok       = ([bool]$phCfg -and [bool]$cfCfg)
    }
}

function Restore-FunnelDualRoutes {
    param([scriptblock]$WriteLog = { param($m) Write-Host $m })

    $ts = Get-TailscaleCommand
    if (-not $ts) {
        & $WriteLog "tailscale.exe not found"
        return $false
    }

    # 只補缺／重宣告；平常不做 reset（reset 會短暫掐斷正在用的外網連線）
    $out1 = (& $ts funnel --bg --yes --https=443 3000 2>&1 | Out-String)
    & $WriteLog ("funnel 443->3000: " + $out1.Trim())
    Start-Sleep -Seconds 1
    $out2 = (& $ts funnel --bg --yes --https=8443 "http://127.0.0.1:5000" 2>&1 | Out-String)
    & $WriteLog ("funnel 8443->5000: " + $out2.Trim())
    Start-Sleep -Seconds 2
    return $true
}

function Reset-FunnelDualRoutes {
    param([scriptblock]$WriteLog = { param($m) Write-Host $m })

    $ts = Get-TailscaleCommand
    if (-not $ts) {
        & $WriteLog "tailscale.exe not found"
        return $false
    }

    & $WriteLog "funnel reset + dual routes (stale Funnel state)"
    $resetOut = (& $ts funnel reset 2>&1 | Out-String)
    if ($resetOut.Trim()) { & $WriteLog ("funnel reset: " + $resetOut.Trim()) }
    $serveOut = (& $ts serve reset 2>&1 | Out-String)
    if ($serveOut.Trim()) { & $WriteLog ("serve reset: " + $serveOut.Trim()) }
    Start-Sleep -Seconds 1
    return (Restore-FunnelDualRoutes -WriteLog $WriteLog)
}

function Get-KeepaliveHealthStatePath {
    param([string]$ProjectRoot)
    return Join-Path $ProjectRoot "data\ops\keepalive-health.json"
}

function Read-KeepaliveHealthState {
    param([string]$ProjectRoot)

    $path = Get-KeepaliveHealthStatePath -ProjectRoot $ProjectRoot
    $obj = [ordered]@{
        pharmacyHttpFails    = 0
        cashflowHttpFails    = 0
        publicFails          = 0
        pendingFunnelReset   = $false
        lastFunnelReapplyAt  = ""
        lastFunnelResetAt    = ""
    }
    if (Test-Path -LiteralPath $path) {
        try {
            $raw = Get-Content -LiteralPath $path -Raw -ErrorAction Stop
            $parsed = $raw | ConvertFrom-Json
            if ($null -ne $parsed.pharmacyHttpFails) { $obj.pharmacyHttpFails = [int]$parsed.pharmacyHttpFails }
            if ($null -ne $parsed.cashflowHttpFails) { $obj.cashflowHttpFails = [int]$parsed.cashflowHttpFails }
            if ($null -ne $parsed.publicFails) { $obj.publicFails = [int]$parsed.publicFails }
            if ($null -ne $parsed.pendingFunnelReset) { $obj.pendingFunnelReset = [bool]$parsed.pendingFunnelReset }
            if ($parsed.lastFunnelReapplyAt) { $obj.lastFunnelReapplyAt = [string]$parsed.lastFunnelReapplyAt }
            if ($parsed.lastFunnelResetAt) { $obj.lastFunnelResetAt = [string]$parsed.lastFunnelResetAt }
        } catch {}
    }
    return $obj
}

function Save-KeepaliveHealthState {
    param(
        [string]$ProjectRoot,
        $State
    )

    $path = Get-KeepaliveHealthStatePath -ProjectRoot $ProjectRoot
    $dir = Split-Path $path -Parent
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    ($State | ConvertTo-Json) | Set-Content -LiteralPath $path -Encoding UTF8
}

function Get-FunnelPublicStatusPath {
    param([string]$ProjectRoot)
    return Join-Path $ProjectRoot "data\ops\funnel-public-status.json"
}

function Save-FunnelPublicStatus {
    param(
        [string]$ProjectRoot,
        [bool]$PublicOk,
        [bool]$RoutesOk,
        [bool]$LocalOk,
        [int]$PublicFails = 0,
        [string]$RepairAction = "none",
        [bool]$Recovered = $false
    )

    $path = Get-FunnelPublicStatusPath -ProjectRoot $ProjectRoot
    $dir = Split-Path $path -Parent
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }

    $prev = $null
    if (Test-Path -LiteralPath $path) {
        try {
            $prev = (Get-Content -LiteralPath $path -Raw) | ConvertFrom-Json
        } catch {}
    }

    $now = (Get-Date).ToString("o")
    $status = [ordered]@{
        checkedAt              = $now
        publicOk               = [bool]$PublicOk
        routesOk               = [bool]$RoutesOk
        localOk                = [bool]$LocalOk
        publicUrl              = (Get-FunnelPublicBaseUrl) + "/login"
        consecutivePublicFails = [int]$PublicFails
        lastPublicOkAt         = if ($PublicOk) { $now } else { $(if ($prev -and $prev.lastPublicOkAt) { [string]$prev.lastPublicOkAt } else { "" }) }
        lastPublicDownAt       = if (-not $PublicOk) { $now } else { $(if ($prev -and $prev.lastPublicDownAt) { [string]$prev.lastPublicDownAt } else { "" }) }
        lastRepairAction       = [string]$RepairAction
        lastRepairAt           = if ($RepairAction -ne "none") { $now } else { $(if ($prev -and $prev.lastRepairAt) { [string]$prev.lastRepairAt } else { "" }) }
        totalIncidents         = [int]($(if ($prev -and $null -ne $prev.totalIncidents) { $prev.totalIncidents } else { 0 }))
        recentIncidents        = @()
    }

    $wasPublicOk = $false
    if ($prev -and $null -ne $prev.publicOk) { $wasPublicOk = [bool]$prev.publicOk }
    if ($wasPublicOk -and -not $PublicOk) {
        $status.totalIncidents = [int]$status.totalIncidents + 1
    }

    $recent = @()
    if ($prev -and $prev.recentIncidents) {
        foreach ($item in @($prev.recentIncidents)) { $recent += $item }
    }
    if ($RepairAction -ne "none") {
        $recent += [ordered]@{
            at        = $now
            action    = [string]$RepairAction
            recovered = [bool]$Recovered
            publicOk  = [bool]$PublicOk
        }
    } elseif ($wasPublicOk -and -not $PublicOk) {
        $recent += [ordered]@{
            at        = $now
            action    = "detected_down"
            recovered = $false
            publicOk  = $false
        }
    }
    if ($recent.Count -gt 30) {
        $recent = @($recent | Select-Object -Last 30)
    }
    $status.recentIncidents = $recent

    ($status | ConvertTo-Json -Depth 5) | Set-Content -LiteralPath $path -Encoding UTF8
    return $status
}

function Register-YaoshengFunnelMonitorTask {
    param(
        [string]$ProjectRoot,
        [string]$RunAs,
        [string]$TaskName = "YaoshengPharmacyFunnelMonitor"
    )

    $monitorScript = Join-Path $ProjectRoot "scripts\windows-funnel-public-monitor.ps1"
    if (-not (Test-Path -LiteralPath $monitorScript)) {
        throw "Missing: $monitorScript"
    }

    Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue

    $principal = New-ScheduledTaskPrincipal `
        -UserId $RunAs `
        -LogonType Interactive `
        -RunLevel Highest

    $action = New-ScheduledTaskAction -Execute "powershell.exe" `
        -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$monitorScript`""

    $settings = New-ScheduledTaskSettingsSet `
        -AllowStartIfOnBatteries `
        -DontStopIfGoingOnBatteries `
        -StartWhenAvailable `
        -MultipleInstances IgnoreNew `
        -ExecutionTimeLimit ([TimeSpan]::Zero)

    $startup = New-ScheduledTaskTrigger -AtStartup
    $startup.Delay = "PT4M"
    $logon = New-ScheduledTaskTrigger -AtLogOn
    $logon.Delay = "PT1M"

    Register-ScheduledTask `
        -TaskName $TaskName `
        -Action $action `
        -Trigger @($startup, $logon) `
        -Principal $principal `
        -Settings $settings `
        -Description "Resident Tailscale Funnel public monitor (30s probe + auto repair)" | Out-Null

    Enable-ScheduledTask -TaskName $TaskName | Out-Null
    Start-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
}

function Get-FunnelCooldownRemainMinutes {
    param(
        $HealthState,
        [string]$FieldName = "lastFunnelReapplyAt",
        [int]$CooldownMinutes = 3
    )
    if (-not $HealthState) { return 0 }
    $raw = [string]$HealthState.$FieldName
    if ([string]::IsNullOrWhiteSpace($raw)) { return 0 }
    try {
        $at = [datetime]::Parse($raw)
        $remain = $CooldownMinutes - ((Get-Date) - $at).TotalMinutes
        if ($remain -le 0) { return 0 }
        return [int][Math]::Ceiling($remain)
    } catch {
        return 0
    }
}

function Repair-FunnelIfNeeded {
    param(
        [scriptblock]$WriteLog = { param($m) Write-Host $m },
        [switch]$ForceReapply,
        [switch]$AllowReset,
        [bool]$LocalOk = $true,
        [int]$MinPublicFails = 1,
        [int]$CooldownMinutes = 3,
        [int]$ResetCooldownMinutes = 10,
        $HealthState = $null
    )

    $ts = Get-TailscaleCommand
    if (-not $ts) {
        & $WriteLog "tailscale missing - cannot restore Funnel"
        return $false
    }

    $state = Get-TailscaleBackendState
    & $WriteLog "tailscale BackendState=$state"
    if ($state -ne "Running" -and $state -ne "unknown") {
        & $WriteLog "tailscale not Running - trying tailscale up"
        $upOut = (& $ts up 2>&1 | Out-String)
        if ($upOut.Trim()) { & $WriteLog $upOut.Trim() }
        Start-Sleep -Seconds 4
        $state = Get-TailscaleBackendState
        & $WriteLog "tailscale BackendState after up=$state"
    }

    $routes = Test-FunnelRoutesConfigured
    $publicOk = Test-FunnelPublicOk
    $publicFails = 0
    if ($HealthState -and $null -ne $HealthState.publicFails) {
        $publicFails = [int]$HealthState.publicFails
    }
    & $WriteLog ("funnel check cfg443=$($routes.Pharmacy) cfg8443=$($routes.Cashflow) public=$publicOk localOk=$LocalOk fails=$publicFails/$MinPublicFails force=$([bool]$ForceReapply)")

    if ($publicOk -and $routes.Ok) {
        if ($HealthState) {
            $HealthState.publicFails = 0
            $HealthState.pendingFunnelReset = $false
        }
        return $true
    }

    # 內網掛了先修網站，不要誤對 Funnel 動手
    if (-not $LocalOk -and -not $ForceReapply) {
        & $WriteLog "local site down - skip Funnel re-apply"
        return $false
    }

    $pendingReset = $false
    if ($HealthState -and $null -ne $HealthState.pendingFunnelReset) {
        $pendingReset = [bool]$HealthState.pendingFunnelReset
    }
    $mayReset = [bool]$ForceReapply -or [bool]$AllowReset
    if ($pendingReset -and $mayReset -and -not $ForceReapply) {
        $resetCoolPending = Get-FunnelCooldownRemainMinutes -HealthState $HealthState -FieldName "lastFunnelResetAt" -CooldownMinutes $ResetCooldownMinutes
        if ($resetCoolPending -le 0) {
            & $WriteLog "pending funnel reset - retry reset now"
            [void](Reset-FunnelDualRoutes -WriteLog $WriteLog)
            if ($HealthState) {
                $HealthState.publicFails = 0
                $HealthState.pendingFunnelReset = $false
                $HealthState.lastFunnelResetAt = (Get-Date).ToString("o")
            }
            Start-Sleep -Seconds 4
            $routesPending = Test-FunnelRoutesConfigured
            $publicPending = Test-FunnelPublicOk
            & $WriteLog ("funnel after pending reset cfg443=$($routesPending.Pharmacy) cfg8443=$($routesPending.Cashflow) public=$publicPending url=" + (Get-FunnelPublicBaseUrl) + "/login")
            return [bool]$publicPending
        }
        & $WriteLog ("pending funnel reset, cooldown {0} min" -f $resetCoolPending)
        return $false
    }

    $shouldReapply = $false
    if ($ForceReapply) {
        $shouldReapply = $true
    } elseif (-not $routes.Ok) {
        $shouldReapply = $true
        & $WriteLog "Funnel routes missing - re-apply now (no reset)"
    } else {
        # 內網通、路由還在、外網窗口不通：這才是要修的情況
        $publicFails = $publicFails + 1
        if ($HealthState) { $HealthState.publicFails = $publicFails }
        $cool = Get-FunnelCooldownRemainMinutes -HealthState $HealthState -CooldownMinutes $CooldownMinutes
        if ($publicFails -lt $MinPublicFails) {
            & $WriteLog ("public window fail {0}/{1} - skip re-apply this round" -f $publicFails, $MinPublicFails)
            return $false
        }
        if ($cool -gt 0) {
            & $WriteLog ("public window still down, cooldown {0} min" -f $cool)
            return $false
        }
        $shouldReapply = $true
        & $WriteLog "local OK but public window failed twice - re-apply (no reset)"
    }

    if (-not $shouldReapply) { return $false }

    [void](Restore-FunnelDualRoutes -WriteLog $WriteLog)
    if ($HealthState) {
        $HealthState.publicFails = 0
        $HealthState.lastFunnelReapplyAt = (Get-Date).ToString("o")
    }
    Start-Sleep -Seconds 3
    $routes2 = Test-FunnelRoutesConfigured
    $public2 = Test-FunnelPublicOk
    & $WriteLog ("funnel after re-apply cfg443=$($routes2.Pharmacy) cfg8443=$($routes2.Cashflow) public=$public2 url=" + (Get-FunnelPublicBaseUrl) + "/login")
    if ($public2) {
        if ($HealthState) { $HealthState.pendingFunnelReset = $false }
        return $true
    }

    if (-not $mayReset) {
        & $WriteLog "public still down after re-apply - will try funnel reset on next eligible round"
        return $false
    }

    $resetCool = Get-FunnelCooldownRemainMinutes -HealthState $HealthState -FieldName "lastFunnelResetAt" -CooldownMinutes $ResetCooldownMinutes
    if ($resetCool -gt 0 -and -not $ForceReapply) {
        & $WriteLog ("public still down, reset cooldown {0} min - will retry reset when ready" -f $resetCool)
        if ($HealthState) { $HealthState.pendingFunnelReset = $true }
        return $false
    }

    & $WriteLog "re-apply did not restore public window - funnel reset"
    [void](Reset-FunnelDualRoutes -WriteLog $WriteLog)
    if ($HealthState) {
        $HealthState.publicFails = 0
        $HealthState.pendingFunnelReset = $false
        $HealthState.lastFunnelResetAt = (Get-Date).ToString("o")
    }
    Start-Sleep -Seconds 4
    $routes3 = Test-FunnelRoutesConfigured
    $public3 = Test-FunnelPublicOk
    & $WriteLog ("funnel after reset cfg443=$($routes3.Pharmacy) cfg8443=$($routes3.Cashflow) public=$public3 url=" + (Get-FunnelPublicBaseUrl) + "/login")
    return [bool]$public3
}

function Get-FunnelStatusJson {
    $ts = Get-TailscaleCommand
    if (-not $ts) { return $null }
    $raw = (& $ts funnel status --json 2>$null | Out-String)
    if ([string]::IsNullOrWhiteSpace($raw)) { return $null }
    try {
        $start = $raw.IndexOf("{")
        $end = $raw.LastIndexOf("}")
        if ($start -lt 0 -or $end -le $start) { return $null }
        return (ConvertFrom-Json -InputObject $raw.Substring($start, $end - $start + 1))
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
        $ts = Get-TailscaleCommand
        if (-not $ts) { return $false }
        $text = (& $ts funnel status 2>$null | Out-String)
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

function Get-Pm2Command {
    # 優先 pm2.cmd：pm2.ps1 在 Stop 模式會 NativeCommandError，且 jlist 輸出常解析失敗
    $candidates = @(
        "$env:APPDATA\npm\pm2.cmd",
        "$env:USERPROFILE\AppData\Roaming\npm\pm2.cmd",
        "$env:LOCALAPPDATA\npm\pm2.cmd",
        "C:\Program Files\nodejs\pm2.cmd"
    )
    foreach ($p in $candidates) {
        if ($p -and (Test-Path -LiteralPath $p)) { return $p }
    }
    $cmd = Get-Command pm2 -ErrorAction SilentlyContinue
    if ($cmd -and $cmd.Source -like "*.cmd") { return $cmd.Source }
    if ($cmd) { return $cmd.Source }
    return $null
}

function Get-KeepaliveContextPath {
    param([string]$ProjectRoot)
    return Join-Path $ProjectRoot "data\ops\keepalive-context.json"
}

function Get-CurrentWindowsUser {
    try {
        $name = [Security.Principal.WindowsIdentity]::GetCurrent().Name
        if (-not [string]::IsNullOrWhiteSpace($name)) { return $name }
    } catch {}
    return "$env:USERDOMAIN\$env:USERNAME"
}

function Save-KeepaliveContext {
    param([string]$ProjectRoot)

    $pm2 = Get-Pm2Command
    $pm2Home = $env:PM2_HOME
    if ([string]::IsNullOrWhiteSpace($pm2Home) -and $env:USERPROFILE) {
        $pm2Home = Join-Path $env:USERPROFILE ".pm2"
    }
    $nodeDir = $null
    $nodeCmd = Get-Command node -ErrorAction SilentlyContinue
    if ($nodeCmd) {
        $nodeDir = Split-Path -Parent $nodeCmd.Source
    } elseif (Test-Path "C:\Program Files\nodejs\node.exe") {
        $nodeDir = "C:\Program Files\nodejs"
    }
    $npmDir = $null
    if ($pm2) { $npmDir = Split-Path -Parent $pm2 }
    $userNpm = Join-Path $env:APPDATA "npm"
    if ($userNpm -and (Test-Path $userNpm)) { $npmDir = $userNpm }

    $obj = [ordered]@{
        savedAt = (Get-Date).ToString("o")
        user    = Get-CurrentWindowsUser
        pm2Home = $pm2Home
        pm2Path = $pm2
        nodeDir = $nodeDir
        npmDir  = $npmDir
    }
    $path = Get-KeepaliveContextPath -ProjectRoot $ProjectRoot
    $dir = Split-Path $path -Parent
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    ($obj | ConvertTo-Json) | Set-Content -LiteralPath $path -Encoding UTF8
    return $path
}

function Import-Pm2Environment {
    param([string]$ProjectRoot)

    $ctxPath = Get-KeepaliveContextPath -ProjectRoot $ProjectRoot
    if (Test-Path -LiteralPath $ctxPath) {
        try {
            $ctx = Get-Content -LiteralPath $ctxPath -Raw -Encoding UTF8 | ConvertFrom-Json
            if ($ctx.pm2Home) { $env:PM2_HOME = [string]$ctx.pm2Home }
            $dirs = @()
            if ($ctx.nodeDir) { $dirs += [string]$ctx.nodeDir }
            if ($ctx.npmDir) { $dirs += [string]$ctx.npmDir }
            foreach ($d in $dirs) {
                if ($d -and (Test-Path $d) -and ($env:Path -notlike "*$d*")) {
                    $env:Path = "$d;$env:Path"
                }
            }
        } catch {}
    }

    if (-not $env:PM2_HOME -and $env:USERPROFILE) {
        $env:PM2_HOME = Join-Path $env:USERPROFILE ".pm2"
    }
    foreach ($d in @(
        "C:\Program Files\nodejs",
        "C:\Program Files\Tailscale",
        "$env:APPDATA\npm",
        "$env:USERPROFILE\AppData\Roaming\npm"
    )) {
        if ($d -and (Test-Path $d) -and ($env:Path -notlike "*$d*")) {
            $env:Path = "$d;$env:Path"
        }
    }
}

function Convert-Pm2JlistToApps {
    param([string]$Raw)

    if ([string]::IsNullOrWhiteSpace($Raw)) { return @() }
    $start = $Raw.IndexOf("[")
    $end = $Raw.LastIndexOf("]")
    if ($start -lt 0 -or $end -le $start) { return @() }
    $json = $Raw.Substring($start, $end - $start + 1)
    try {
        $apps = ConvertFrom-Json -InputObject $json -ErrorAction Stop
        if ($null -eq $apps) { return @() }
        return @($apps)
    } catch {
        return @()
    }
}

function Get-Pm2AppsFromKnownNames {
    param([string]$Pm2)

    $apps = @()
    foreach ($name in @("pharmacy-web", "cashflow")) {
        $prevEap = $ErrorActionPreference
        $ErrorActionPreference = "Continue"
        try {
            $raw = (& $pm2 describe $name --json 2>&1 | Out-String)
        } finally {
            $ErrorActionPreference = $prevEap
        }
        if ([string]::IsNullOrWhiteSpace($raw)) { continue }
        try {
            $parsed = ConvertFrom-Json -InputObject $raw.Trim() -ErrorAction Stop
            if ($null -eq $parsed) { continue }
            foreach ($item in @($parsed)) {
                if ($item.name -eq $name) { $apps += $item }
            }
        } catch {}
    }
    return $apps
}

function Get-Pm2Apps {
    $pm2 = Get-Pm2Command
    if (-not $pm2) { return @() }

    $prevEap = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        # 2>&1：部分環境 jlist 會寫到 stderr；2>$null 會讓 health-check 誤報 apps=0
        $raw = (& $pm2 jlist 2>&1 | Out-String)
        $apps = Convert-Pm2JlistToApps -Raw $raw
        if ($apps.Count -gt 0) { return $apps }

        # 備援：繞過 pm2.ps1 的輸出處理
        $rawViaCmd = (cmd.exe /c "`"$pm2`" jlist 2>&1" | Out-String)
        $apps = Convert-Pm2JlistToApps -Raw $rawViaCmd
        if ($apps.Count -gt 0) { return $apps }

        return @(Get-Pm2AppsFromKnownNames -Pm2 $pm2)
    } catch {
        return @(Get-Pm2AppsFromKnownNames -Pm2 $pm2)
    } finally {
        $ErrorActionPreference = $prevEap
    }
}

function Get-Pm2PidDirect {
    param([string]$Name)

    $result = Invoke-Pm2Safe -Pm2Args @("pid", $Name) -CaptureOutput
    if ($result.ExitCode -ne 0) { return $null }
    foreach ($line in ($result.Output -split "`r?`n")) {
        $line = $line.Trim()
        if ($line -match '^\d+$') {
            $processId = [int]$line
            if ($processId -gt 0) { return $processId }
        }
    }
    return $null
}

function Get-Pm2Online([string]$Name) {
    foreach ($app in (Get-Pm2Apps)) {
        if ($app.name -eq $Name -and $app.pm2_env.status -eq "online") { return $true }
    }
    return $false
}

function Test-Pm2AppExists([string]$Name) {
    foreach ($app in (Get-Pm2Apps)) {
        if ($app.name -eq $Name) { return $true }
    }
    return [bool](Get-Pm2PidDirect -Name $Name)
}

function Get-Pm2Pid([string]$Name) {
    foreach ($app in (Get-Pm2Apps)) {
        if ($app.name -eq $Name) {
            $processId = 0
            if ([int]::TryParse("$($app.pid)", [ref]$processId) -and $processId -gt 0) {
                return $processId
            }
        }
    }
    return (Get-Pm2PidDirect -Name $Name)
}

<#
  安全呼叫 PM2：一律用 pm2.cmd（避開 pm2.ps1 的 NativeCommandError），
  並在 $ErrorActionPreference=Stop 的更新腳本中也不會因 stderr 中斷。
  -OnlyIfAppExists：stop/delete/restart 在 app 尚未註冊時略過（PM2 會回 not found）。
#>
function Invoke-Pm2Safe {
    param(
        [Parameter(Mandatory = $true)][string[]]$Pm2Args,
        [string]$OnlyIfAppExists = "",
        [switch]$CaptureOutput
    )

    $pm2 = Get-Pm2Command
    if (-not $pm2) {
        if ($CaptureOutput) { return @{ ExitCode = -1; Output = "pm2 not found" } }
        return -1
    }

    if ($OnlyIfAppExists -and -not (Test-Pm2AppExists -Name $OnlyIfAppExists)) {
        if ($CaptureOutput) { return @{ ExitCode = 0; Output = "" } }
        return 0
    }

    $prevEap = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        $output = (& $pm2 @Pm2Args 2>&1 | Out-String)
        $exitCode = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $prevEap
    }

    if ($CaptureOutput) { return @{ ExitCode = $exitCode; Output = $output } }
    return $exitCode
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

    if (-not (Get-Pm2Command)) {
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

    $scriptArgs = @()
    if ($cfg.args) {
        foreach ($a in $cfg.args) { $scriptArgs += [string]$a }
    }

    $port = 5000
    if ($cfg.port) {
        $parsed = 0
        if ([int]::TryParse([string]$cfg.port, [ref]$parsed) -and $parsed -gt 0) { $port = $parsed }
    }
    $env:PORT = [string]$port

    & $WriteLog "Registering cashflow via bootstrap config"
    [void](Invoke-Pm2Safe -Pm2Args @("delete", "cashflow") -OnlyIfAppExists "cashflow")
    if ($scriptArgs.Count -gt 0) {
        $startResult = Invoke-Pm2Safe -Pm2Args @(
            "start", $scriptPath, "--name", "cashflow", "--cwd", $cwd, "--update-env", "--"
        ) + $scriptArgs -CaptureOutput
    } else {
        $startResult = Invoke-Pm2Safe -Pm2Args @(
            "start", $scriptPath, "--name", "cashflow", "--cwd", $cwd, "--update-env"
        ) -CaptureOutput
    }
    if ($startResult.ExitCode -ne 0) {
        if ($startResult.Output.Trim()) { & $WriteLog $startResult.Output.Trim() }
        & $WriteLog "cashflow pm2 start failed"
        return $false
    }

    [void](Invoke-Pm2Safe -Pm2Args @("save"))
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
        [void](Invoke-Pm2Safe -Pm2Args @("stop", "pharmacy-web") -OnlyIfAppExists "pharmacy-web")
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

    $pm2 = Get-Pm2Command
    if (-not $pm2) {
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
    [void](Invoke-Pm2Safe -Pm2Args @("delete", "pharmacy-web") -OnlyIfAppExists "pharmacy-web")
    $startResult = Invoke-Pm2Safe -Pm2Args @(
        "start", $ecosystem, "--only", "pharmacy-web", "--update-env"
    ) -CaptureOutput
    if ($startResult.ExitCode -ne 0) {
        if ($startResult.Output.Trim()) { & $WriteLog $startResult.Output.Trim() }
        return $false
    }
    [void](Invoke-Pm2Safe -Pm2Args @("save"))
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

function Test-PharmacyWebHttpHealthy {
    if (Test-HttpOk -Uri "http://127.0.0.1:3000/api/health" -TimeoutSec 8) { return $true }
    return (Test-SiteHealthy)
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
        if ((Test-PharmacyWebPm2OwningPort) -and (Test-PharmacyWebHttpHealthy)) { return $true }
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

    if (-not (Get-Pm2Command)) {
        & $WriteLog "pm2 not found"
        return $false
    }

    if (-not (Test-Path (Join-Path $ProjectRoot ".env.local"))) {
        & $WriteLog "WARNING: .env.local missing (startup may fail)"
    }

    if (-not (Test-PharmacyWebBuildReady -ProjectRoot $ProjectRoot)) {
        & $WriteLog "Build incomplete — running npm run build before PM2 start"
        try {
            Invoke-NpmBuild -ProjectRoot $ProjectRoot
        } catch {
            & $WriteLog ("npm run build failed: {0}" -f $_.Exception.Message)
            return $false
        }
    }

    if (-not (Test-PharmacyWebBuildReady -ProjectRoot $ProjectRoot)) {
        & $WriteLog "Build still incomplete after npm run build"
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

        [void](Invoke-Pm2Safe -Pm2Args @("delete", "pharmacy-web") -OnlyIfAppExists "pharmacy-web")
        if (-not (Ensure-PharmacyWebPm2Registered -ProjectRoot $ProjectRoot -WriteLog $WriteLog)) {
            if ($attempt -ge $MaxAttempts) { return $false }
            Start-Sleep -Seconds 3
            continue
        }

        if (Wait-PharmacyWebHealthy -TimeoutSeconds 50) {
            [void](Invoke-Pm2Safe -Pm2Args @("save"))
            $pm2Pid = Get-Pm2Pid -Name "pharmacy-web"
            $listenPid = Get-PortListenerPid -Port 3000
            & $WriteLog ("pharmacy-web online pm2={0} port={1}" -f $pm2Pid, $listenPid)
            return $true
        }

        & $WriteLog "pharmacy-web not healthy after start"
        $pm2LogTail = (Invoke-Pm2Safe -Pm2Args @("logs", "pharmacy-web", "--lines", "20", "--nostream") -OnlyIfAppExists "pharmacy-web" -CaptureOutput).Output
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

        # 自動自癒：.next 損壞、缺 BUILD_ID、或 git pull 後 Server Action 不一致
        $needsRebuild = ($errTail -match "production build|production-start-no-build-id|Failed to find Server Action") `
            -or ($pm2LogTail -match "production build|production-start-no-build-id")
        if (-not $didDeepRepair -and ($needsRebuild -or ($pm2LogTail -match "MODULE_NOT_FOUND") -or ($errTail -match "MODULE_NOT_FOUND") -or ($errTail -match "Cannot find module"))) {
            $didDeepRepair = $true
            if ($needsRebuild) {
                & $WriteLog "Detected stale/incomplete .next — rebuild then retry PM2"
            } else {
                & $WriteLog "Detected MODULE_NOT_FOUND. Running deep repair: stop -> clear .next -> npm install -> build"
            }
            try {
                [void](Invoke-Pm2Safe -Pm2Args @("stop", "pharmacy-web") -OnlyIfAppExists "pharmacy-web")
                Stop-ProjectWebProcesses -ProjectRoot $ProjectRoot
                if (-not $needsRebuild) {
                    Clear-NextBuild -ProjectRoot $ProjectRoot
                    Push-Location $ProjectRoot
                    try {
                        $npm = "C:\Program Files\nodejs\npm.cmd"
                        & $npm install
                        if ($LASTEXITCODE -ne 0) { throw "npm install failed with exit code $LASTEXITCODE" }
                    } finally {
                        Pop-Location
                    }
                }
                Invoke-NpmBuild -ProjectRoot $ProjectRoot
                & $WriteLog "Build completed; retrying startup"
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

    if (-not (Get-Pm2Command)) {
        & $WriteLog "pm2 not found, cannot repair $Name"
        return $false
    }

    if ($Name -eq "pharmacy-web" -and $ProjectRoot) {
        & $WriteLog "Repairing pharmacy-web via Restart-PharmacyWebPm2"
        return (Restart-PharmacyWebPm2 -ProjectRoot $ProjectRoot -WriteLog $WriteLog)
    }

    if ($Name -eq "cashflow" -and $ProjectRoot) {
        if (-not (Get-Pm2Online -Name "cashflow")) {
            if (Ensure-CashflowPm2Registered -ProjectRoot $ProjectRoot -WriteLog $WriteLog) {
                Start-Sleep -Seconds 3
                if ($HealthyCheck) {
                    if (& $HealthyCheck) { return $true }
                } else {
                    return $true
                }
            }
        }
    }

    & $WriteLog "Repairing pm2 app: $Name"
    [void](Invoke-Pm2Safe -Pm2Args @("resurrect"))
    [void](Invoke-Pm2Safe -Pm2Args @("restart", $Name, "--update-env") -OnlyIfAppExists $Name)
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

    if (Get-Pm2Command) {
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

function Repair-Pm2SitesIfNeeded {
    param(
        [string]$ProjectRoot,
        [scriptblock]$WriteLog = { param($m) Write-Host $m }
    )

    if (-not (Get-Pm2Command)) {
        & $WriteLog "pm2 not found — cannot adopt sites into PM2"
        return $false
    }

    $allOk = $true
    $cashflowPort = Get-CashflowHealthPort -ProjectRoot $ProjectRoot

    # pharmacy：HTTP 掛了也要啟動，不可只在 HTTP OK 時才收編
    if (-not ((Test-SiteHealthy) -and (Test-PharmacyWebPm2OwningPort))) {
        if ((Test-SiteHealthy) -and -not (Test-PharmacyWebPm2OwningPort)) {
            & $WriteLog "pharmacy HTTP OK but PM2 does not own :3000 — adopting into PM2"
        } else {
            & $WriteLog "pharmacy down or not under PM2 — starting via PM2"
        }
        if (-not (Repair-SiteIfNeeded -ProjectRoot $ProjectRoot -WriteLog $WriteLog)) {
            $allOk = $false
        }
    }

    $cashflowHealthy = Test-CashflowHealthy -ProjectRoot $ProjectRoot
    $cashflowPm2Online = Get-Pm2Online -Name "cashflow"
    if (-not $cashflowPm2Online) {
        if ($cashflowHealthy) {
            & $WriteLog "cashflow HTTP OK but PM2 cashflow not online — adopting into PM2"
        } else {
            & $WriteLog "cashflow not under PM2 — registering/restarting"
        }
        $listenerPid = Get-PortListenerPid -Port $cashflowPort
        if ($listenerPid -and -not $cashflowPm2Online) {
            & $WriteLog ("Port $cashflowPort occupied by orphan pid=$listenerPid, force cleanup")
            [void](Stop-PortListenerForce -Port $cashflowPort -WriteLog $WriteLog)
            Start-Sleep -Seconds 2
        }
        if (-not (Ensure-CashflowPm2Registered -ProjectRoot $ProjectRoot -WriteLog $WriteLog)) {
            if (-not (Repair-Pm2AppIfNeeded -Name "cashflow" -ProjectRoot $ProjectRoot -HealthyCheck {
                Test-CashflowHealthy -ProjectRoot $ProjectRoot
            } -WriteLog $WriteLog)) {
                $allOk = $false
            }
        }
    } elseif ($cashflowHealthy -and -not $cashflowPm2Online) {
        & $WriteLog "cashflow HTTP OK but PM2 cashflow not online — adopting into PM2"
        $listenerPid = Get-PortListenerPid -Port $cashflowPort
        if ($listenerPid) {
            & $WriteLog ("Port $cashflowPort occupied by orphan pid=$listenerPid, force cleanup")
            [void](Stop-PortListenerForce -Port $cashflowPort -WriteLog $WriteLog)
        }
        if (-not (Repair-Pm2AppIfNeeded -Name "cashflow" -ProjectRoot $ProjectRoot -HealthyCheck {
            Test-CashflowHealthy -ProjectRoot $ProjectRoot
        } -WriteLog $WriteLog)) {
            $allOk = $false
        }
    }

    if ($allOk -and (Get-Pm2Command)) {
        [void](Invoke-Pm2Safe -Pm2Args @("save"))
    }
    return $allOk
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
            & $WriteLog "Build in progress, skip repair this round"
            return $false
        }
        & $WriteLog "Orphan build lock without build process, clearing..."
        Remove-Item -LiteralPath $lockFile -Force -ErrorAction SilentlyContinue
    }

    $siteHealthy = Test-SiteHealthy
    $pm2Owns = Test-PharmacyWebPm2OwningPort
    if ($siteHealthy -and -not $pm2Owns) {
        & $WriteLog "Site HTTP OK but PM2 does not own :3000 — adopting into PM2"
    } else {
        & $WriteLog "Site unhealthy, repairing..."
    }
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
        if ((Test-SiteHealthy) -and (Test-PharmacyWebPm2OwningPort)) {
            & $WriteLog "Site repaired under PM2"
            return $true
        }
    }

    & $WriteLog "Site repair failed (port may be held by zombie; will retry next minute)"
    return $false
}
