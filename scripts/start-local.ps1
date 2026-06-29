# 啟動本機藥局排班系統（Supabase + Next.js）
# 用法：.\scripts\start-local.ps1

$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

Write-Host "檢查 Supabase..." -ForegroundColor Cyan
$status = supabase status 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "啟動 Supabase..." -ForegroundColor Yellow
    supabase start
}

Write-Host "啟動網站 http://localhost:3000" -ForegroundColor Green
npm run dev
