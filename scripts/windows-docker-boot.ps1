# 新機 Docker 方案：開機／登入後自動啟動
# Docker Desktop → supabase start → pm2 網站 → Tailscale Funnel
$ErrorActionPreference = "Continue"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

$LogDir = Join-Path $ProjectRoot "data\logs"
$LogFile = Join-Path $LogDir "docker-boot.log"
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

function Log([string]$Message) {
    $line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $Message"
    Add-Content -Path $LogFile -Value $line -Encoding UTF8
    Write-Host $line
}

# 確保常見工具在 PATH
$env:Path = @(
    $env:Path,
    "C:\Program Files\nodejs",
    "C:\Program Files\Docker\Docker\resources\bin",
    "$env:APPDATA\npm",
    "C:\Program Files\Tailscale"
) -join ";"

Log "=== docker boot start ==="

# 1) 等 Docker（最多約 4 分鐘）
$dockerOk = $false
for ($i = 1; $i -le 48; $i++) {
    try {
        docker info 1>$null 2>$null
        if ($LASTEXITCODE -eq 0) {
            $dockerOk = $true
            break
        }
    } catch {}
    Log "waiting Docker... $i/48"
    Start-Sleep -Seconds 5
}
if (-not $dockerOk) {
    Log "ERROR: Docker not ready"
    exit 1
}
Log "Docker ready"

# 2) Supabase
Log "supabase start"
& supabase start *>> $LogFile
Start-Sleep -Seconds 20

# 3) 網站（pm2）
Log "pm2 ensure pharmacy-web"
$eco = Join-Path $ProjectRoot "ecosystem.config.cjs"
& pm2 describe pharmacy-web 1>$null 2>$null
if ($LASTEXITCODE -ne 0) {
    & pm2 start $eco *>> $LogFile
} else {
    & pm2 resurrect *>> $LogFile
    Start-Sleep -Seconds 3
    & pm2 describe pharmacy-web 1>$null 2>$null
    if ($LASTEXITCODE -ne 0) {
        & pm2 start $eco *>> $LogFile
    }
}
& pm2 save *>> $LogFile
Start-Sleep -Seconds 5

# 4) Funnel
Log "tailscale funnel --bg 3000"
& tailscale funnel --bg 3000 *>> $LogFile

Log "=== docker boot done ==="
exit 0
