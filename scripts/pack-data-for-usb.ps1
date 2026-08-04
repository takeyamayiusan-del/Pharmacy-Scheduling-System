# 僅打包 data/ 資料夾到 ZIP，供 USB 帶到分店（程式碼請用 GitHub 下載）
# 用法：powershell -ExecutionPolicy Bypass -File scripts/pack-data-for-usb.ps1

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$DataRoot = Join-Path $ProjectRoot "data"
$Stamp = Get-Date -Format "yyyy-MM-dd"
$ZipPath = Join-Path $ProjectRoot "yaosheng-data-$Stamp.zip"

if (-not (Test-Path $DataRoot)) {
    Write-Host "錯誤：找不到 data/ 目錄。請先 npm run data:setup-dirs" -ForegroundColor Red
    exit 1
}

Write-Host "打包 data/ 至 $ZipPath ..." -ForegroundColor Cyan
if (Test-Path $ZipPath) { Remove-Item $ZipPath -Force }
Compress-Archive -Path "$DataRoot\*" -DestinationPath $ZipPath -CompressionLevel Optimal

Write-Host ""
Write-Host "完成！" -ForegroundColor Green
Write-Host "  1. 程式碼：git push 後到分店 git clone"
Write-Host "  2. 資料：將此 ZIP 拷到 USB → 分店解壓到專案 data/ 目錄"
Write-Host "  檔案：$ZipPath"
