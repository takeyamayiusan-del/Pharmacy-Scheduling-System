# Pack branch USB: database SQL dump + readme
# Usage: npm run data:pack-branch-usb

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$BackupsDir = Join-Path $ProjectRoot "data\backups"
$Stamp = Get-Date -Format "yyyy-MM-dd"
$DumpFile = Join-Path $BackupsDir "yaosheng-local-$Stamp.sql"
$ZipPath = Join-Path $ProjectRoot "yaosheng-usb-$Stamp.zip"

if (-not (Test-Path $BackupsDir)) {
    New-Item -ItemType Directory -Path $BackupsDir -Force | Out-Null
}

$containerLine = docker ps --format "{{.Names}}" 2>&1 | Where-Object { $_ -match "supabase_db" } | Select-Object -First 1
if ($containerLine) {
    $name = $containerLine.ToString().Trim()
    Write-Host "Dumping database from $name ..." -ForegroundColor Cyan
    docker exec $name pg_dump -U postgres -d postgres --no-owner --no-acl | Out-File -FilePath $DumpFile -Encoding utf8
    Write-Host "  Saved: $DumpFile" -ForegroundColor Green
}
elseif (-not (Test-Path $DumpFile)) {
    Write-Host "ERROR: Supabase not running and no dump file for today. Run supabase start first." -ForegroundColor Yellow
    exit 1
}
else {
    Write-Host "Using existing dump: $DumpFile" -ForegroundColor Yellow
}

$readme = Join-Path $BackupsDir "USB_README.txt"
if (-not (Test-Path $readme)) {
    Write-Host "ERROR: Missing $readme" -ForegroundColor Red
    exit 1
}

if (Test-Path $ZipPath) { Remove-Item $ZipPath -Force }
Compress-Archive -Path @($DumpFile, $readme) -DestinationPath $ZipPath -CompressionLevel Optimal

Write-Host ""
Write-Host "Copy this file to USB:" -ForegroundColor Green
Write-Host "  $ZipPath"
Write-Host ""
Write-Host "At branch, clone code with:" -ForegroundColor Cyan
Write-Host "  git clone -b deploy/local-production https://github.com/takeyamayiusan-del/Pharmacy-Scheduling-System.git"
