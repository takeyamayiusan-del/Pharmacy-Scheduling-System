# 檢查 Node.js 版本（Next.js 14 建議使用 18～22，不支援 24）
$version = (node -v)
Write-Host "目前 Node.js：$version"

if ($version -match '^v(2[4-9]|[3-9]\d)') {
    Write-Host ""
    Write-Host "錯誤：Node.js 24 與 Next.js 14 不相容，會導致 Internal Server Error。" -ForegroundColor Red
    Write-Host ""
    Write-Host "請安裝 Node.js 20 LTS：" -ForegroundColor Yellow
    Write-Host "  1. 開啟 https://nodejs.org/zh-tw 下載 20.x LTS"
    Write-Host "  2. 安裝後重開 PowerShell"
    Write-Host "  3. 在專案目錄執行："
    Write-Host "       Remove-Item -Recurse -Force node_modules, .next"
    Write-Host "       npm install"
    Write-Host "       supabase start"
    Write-Host "       npm run dev"
    Write-Host ""
    Write-Host "或使用 winget（系統管理員）："
    Write-Host "  winget install OpenJS.NodeJS.LTS --version 20.18.0"
    exit 1
}

Write-Host "Node 版本 OK" -ForegroundColor Green
