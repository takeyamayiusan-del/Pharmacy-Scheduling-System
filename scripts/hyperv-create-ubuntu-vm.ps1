# Yaosheng Pharmacy - Create Ubuntu VM in Hyper-V for local Supabase
# Run as Administrator:
#   powershell -ExecutionPolicy Bypass -File scripts\hyperv-create-ubuntu-vm.ps1
#   powershell -ExecutionPolicy Bypass -File scripts\hyperv-create-ubuntu-vm.ps1 -IsoPath "D:\iso\ubuntu-22.04.5-live-server-amd64.iso"

param(
    [string]$VmName = "yaosheng-supabase",
    [string]$IsoPath = "",
    [int64]$MemoryGB = 4,
    [int64]$DiskGB = 60,
    [int]$CpuCount = 2
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$VmRoot = Join-Path $ProjectRoot "data\hyperv"
$VhdPath = Join-Path $VmRoot "$VmName.vhdx"

if (-not $IsoPath) {
    $defaultIso = Join-Path $VmRoot "ubuntu-22.04-server.iso"
    $rootIso = Get-ChildItem -Path $ProjectRoot -Filter "*.iso" -File -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1
    if (Test-Path $defaultIso) {
        $IsoPath = $defaultIso
    } elseif ($rootIso) {
        $IsoPath = $rootIso.FullName
    } else {
        $IsoPath = $defaultIso
    }
}

Write-Host "=== Hyper-V Ubuntu VM Setup ===" -ForegroundColor Cyan
Write-Host "VM name   : $VmName"
Write-Host "ISO path  : $IsoPath"
Write-Host "Memory    : ${MemoryGB} GB"
Write-Host "Disk      : ${DiskGB} GB"
Write-Host "vCPU      : $CpuCount"
Write-Host ""

if (-not (Get-Command Get-VM -ErrorAction SilentlyContinue)) {
    throw "Hyper-V not found. Install Hyper-V role and run PowerShell as Administrator."
}

$existingVm = Get-VM -Name $VmName -ErrorAction SilentlyContinue
if ($existingVm) {
    throw "VM already exists: $VmName. Remove it first: Remove-VM -Name '$VmName' -Force"
}

if (-not (Test-Path $IsoPath)) {
    Write-Host "Ubuntu ISO not found:" -ForegroundColor Red
    Write-Host "  $IsoPath"
    Write-Host ""
    Write-Host "Download Ubuntu 22.04 Server ISO (AMD64):" -ForegroundColor Yellow
    Write-Host "  https://releases.ubuntu.com/22.04/ubuntu-22.04.5-live-server-amd64.iso"
    Write-Host ""
    Write-Host "Save it to:" -ForegroundColor Yellow
    Write-Host "  $IsoPath"
    Write-Host "Or pass -IsoPath with your file location."
    exit 1
}

$switch = Get-VMSwitch | Select-Object -First 1
if (-not $switch) {
    throw "No Hyper-V virtual switch found. Create an External switch in Hyper-V Manager."
}

New-Item -ItemType Directory -Force -Path $VmRoot | Out-Null

Write-Host "Using virtual switch: $($switch.Name)" -ForegroundColor Green

$memoryBytes = $MemoryGB * 1GB
$diskBytes = $DiskGB * 1GB

New-VM `
    -Name $VmName `
    -MemoryStartupBytes $memoryBytes `
    -Generation 2 `
    -NewVHDPath $VhdPath `
    -NewVHDSizeBytes $diskBytes `
    -SwitchName $switch.Name | Out-Null

Set-VMProcessor -VMName $VmName -Count $CpuCount
Set-VMMemory -VMName $VmName -DynamicMemoryEnabled $true -MinimumBytes 2GB -MaximumBytes ($MemoryGB * 1GB)
Set-VM -Name $VmName -AutomaticCheckpointsEnabled $false

Add-VMDvdDrive -VMName $VmName -Path $IsoPath
$dvd = Get-VMDvdDrive -VMName $VmName
Set-VMFirmware -VMName $VmName -FirstBootDevice $dvd

Write-Host ""
Write-Host "VM created successfully." -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  1. Open Hyper-V Manager and start: $VmName"
Write-Host "  2. Install Ubuntu 22.04 Server (enable OpenSSH)"
Write-Host "  3. Create user, e.g. yaosheng"
Write-Host "  4. Shut down VM, remove DVD drive, start again"
Write-Host "  5. Note VM IP (ip a), run ubuntu-vm-setup-supabase.sh in Ubuntu"
Write-Host ""
Write-Host "Start VM:" -ForegroundColor Cyan
Write-Host "  Start-VM -Name '$VmName'"
