# Start Next.js web app on Windows (本機 Docker Supabase + 可改用 pm2)
# Usage: powershell -ExecutionPolicy Bypass -File scripts\windows-start-web.ps1
# 正式環境請優先：pm2 restart pharmacy-web

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

$node = "C:\Program Files\nodejs\node.exe"
$npm = "C:\Program Files\nodejs\npm.cmd"

if (-not (Test-Path $node)) {
    throw "Node.js not found. Install Node.js 20 LTS."
}

if (-not (Test-Path ".env.local")) {
    Write-Host "Missing .env.local" -ForegroundColor Red
    Write-Host "Run: copy .env.local.example .env.local"
    Write-Host "Fill keys from: supabase status"
    exit 1
}

Write-Host "=== npm install ===" -ForegroundColor Cyan
& $npm install

if (-not (Test-Path ".next")) {
    Write-Host "=== npm run build ===" -ForegroundColor Cyan
    & $npm run build
}

Write-Host ""
Write-Host "=== Starting http://localhost:3000 ===" -ForegroundColor Green
Write-Host "Press Ctrl+C to stop"
& $npm start
