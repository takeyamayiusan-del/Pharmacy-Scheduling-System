# Shared idempotent Funnel helpers (ASCII-only for Windows PowerShell 5.1)
# - Never call funnel/serve reset here (reset thrashing breaks public Funnel)
# - Repeated ensure calls are safe: only add missing mounts

function Get-YaoshengFunnelStatusText {
  $funnel = (& tailscale funnel status 2>&1 | Out-String)
  $serve = (& tailscale serve status 2>&1 | Out-String)
  return ($funnel + "`n" + $serve)
}

function Get-YaoshengFunnelHost {
  param([string]$StatusText)
  if ($StatusText -match '(https://([a-z0-9-]+\.tail[a-z0-9]+\.ts\.net))') {
    return $Matches[2]
  }
  $st = (& tailscale status --json 2>$null | Out-String)
  if ($st -match '"DNSName"\s*:\s*"([^"]+)\."') {
    return $Matches[1].TrimEnd('.')
  }
  return $null
}

function Test-YaoshengHttpCodeOk {
  param([string]$Code)
  return @("200", "204", "301", "302", "307", "308") -contains (("$Code").Trim())
}

function Test-YaoshengLocalHttp {
  param([string]$Uri, [int]$TimeoutSec = 5)
  try {
    $out = & curl.exe -s -o NUL -w "%{http_code}" --connect-timeout 3 --max-time $TimeoutSec $Uri 2>$null
    if ($LASTEXITCODE -ne 0) { return $false }
    return (Test-YaoshengHttpCodeOk $out)
  } catch {
    return $false
  }
}

function Resolve-YaoshengIpv4 {
  param([string]$HostName)
  if (-not $HostName) { return $null }
  try {
    $recs = Resolve-DnsName -Name $HostName -Type A -Server 8.8.8.8 -DnsOnly -ErrorAction Stop
    $ip = ($recs | Where-Object { $_.IPAddress } | Select-Object -First 1).IPAddress
    if ($ip) { return [string]$ip }
  } catch {}
  try {
    $out = (& nslookup $HostName 8.8.8.8 2>&1 | Out-String)
    $ips = @(
      [regex]::Matches($out, '(?m)^\s*Address(?:es)?\s*:\s*(\d{1,3}(?:\.\d{1,3}){3})\s*$') |
        ForEach-Object { $_.Groups[1].Value }
    ) | Where-Object { $_ -and $_ -ne "8.8.8.8" }
    if ($ips.Count -gt 0) { return [string]$ips[0] }
  } catch {}
  return $null
}

function Test-YaoshengFunnelMountConfigured {
  param(
    [string]$StatusText,
    [int]$LocalPort,
    [int]$HttpsPort = 443
  )
  if ($StatusText -notmatch "(?i)Funnel on") { return $false }
  if ($StatusText -notmatch "127\.0\.0\.1:$LocalPort") { return $false }
  if ($HttpsPort -eq 443) { return $true }
  return ($StatusText -match [regex]::Escape(":$HttpsPort"))
}

function Test-YaoshengPublicFunnelIpv4 {
  param(
    [string]$HostName,
    [int]$HttpsPort = 443,
    [string]$Path = "/",
    [int]$TimeoutSec = 12
  )
  if (-not $HostName) { return $false }
  $ip = Resolve-YaoshengIpv4 -HostName $HostName
  if (-not $ip) { return $false }
  $url = "https://${HostName}:${HttpsPort}${Path}"
  if ($HttpsPort -eq 443) { $url = "https://${HostName}${Path}" }
  try {
    $out = & curl.exe -4 -s -o NUL -w "%{http_code}" --connect-timeout 5 --max-time $TimeoutSec --resolve "${HostName}:${HttpsPort}:${ip}" $url 2>$null
    if ($LASTEXITCODE -ne 0) { return $false }
    return (Test-YaoshengHttpCodeOk $out)
  } catch {
    return $false
  }
}

function Ensure-YaoshengFunnelMounts {
  param(
    [Parameter(Mandatory = $true)]$HostConfig,
    [Parameter(Mandatory = $true)]$Sites,
    [scriptblock]$Log = { param($m) Write-Host $m }
  )

  $primaryPort = [int]$HostConfig.PrimaryFunnelPort
  if ($primaryPort -le 0) { $primaryPort = 3000 }

  $status = Get-YaoshengFunnelStatusText

  # If serve demoted funnel to tailnet-only, re-assert funnel mounts WITHOUT full reset first
  $serveConflict = ($status -match "(?i)Available within your tailnet") -and ($status -notmatch "(?i)Funnel on")

  if ($status -notmatch "Funnel on" -or $status -notmatch "127\.0\.0\.1:$primaryPort" -or $serveConflict) {
    & $Log "Ensure Funnel primary -> 127.0.0.1:$primaryPort"
    & tailscale funnel --bg --yes $primaryPort | Out-Null
    $status = Get-YaoshengFunnelStatusText
  } else {
    & $Log "OK Funnel primary configured :443 -> 127.0.0.1:$primaryPort"
  }

  foreach ($site in $Sites) {
    $port = [int]$site.Port
    $httpsPort = 0
    if ($site.ContainsKey("FunnelHttpsPort") -and $site.FunnelHttpsPort) {
      $httpsPort = [int]$site.FunnelHttpsPort
    }
    if ($httpsPort -le 0) { continue }
    if ($port -eq $primaryPort) { continue }
    $root = [string]$site.Root
    if ($root -and -not (Test-Path $root)) { continue }

    $status = Get-YaoshengFunnelStatusText
    $hasHttps = $status -match [regex]::Escape(":$httpsPort")
    $hasProxy = $status -match "127\.0\.0\.1:$port"
    if ($hasHttps -and $hasProxy) {
      & $Log "OK Funnel $($site.Name) configured :$httpsPort -> 127.0.0.1:$port"
      continue
    }

    & $Log "Ensure Funnel $($site.Name) :$httpsPort -> 127.0.0.1:$port"
    & tailscale funnel --bg --yes --https=$httpsPort $port | Out-Null
  }

  return (Get-YaoshengFunnelStatusText)
}
