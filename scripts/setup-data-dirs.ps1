# 建立專案內 data/ 資料目錄（與程式碼同一資料夾，整包可搬移）
# 用法：npm run data:setup-dirs

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$DataRoot = Join-Path $ProjectRoot "data"

$dirs = @(
    $DataRoot,
    "$DataRoot\postgres",
    "$DataRoot\storage",
    "$DataRoot\backups",
    "$DataRoot\app-logs"
)

Write-Host "建立資料目錄（專案內）：$DataRoot" -ForegroundColor Cyan

foreach ($dir in $dirs) {
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
        Write-Host "  [新建] $dir"
    } else {
        Write-Host "  [已有] $dir"
    }

    $keep = Join-Path $dir ".gitkeep"
    if (-not (Test-Path $keep)) {
        New-Item -ItemType File -Path $keep -Force | Out-Null
    }
}

Write-Host ""
Write-Host "完成！所有資料將存放在：" -ForegroundColor Green
Write-Host "  $DataRoot"
Write-Host ""
Write-Host "搬移方式：將整個專案資料夾複製或壓縮後移到新電腦即可。" -ForegroundColor Yellow
Write-Host "下一步：supabase start  （資料庫會寫入 data\postgres）"
