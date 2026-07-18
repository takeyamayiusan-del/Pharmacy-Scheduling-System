# Shared multi-site config for boot + watchdog

$Global:YaoshengHostConfig = @{
  WatchAllPm2 = $true
  EnsureSupabase = $true
  SupabaseHealthUrl = "http://127.0.0.1:54321/auth/v1/health"
  PrimaryFunnelPort = 3000
}

$Global:YaoshengSites = @(
  @{
    Name       = "pharmacy-web"
    Port       = 3000
    Root       = "C:\Pharmacy-Scheduling-System"
    Ecosystem  = "ecosystem.config.cjs"
    HealthPath = "/login"
  }
  @{
    Name       = "cashflow"
    Port       = 5000
    Root       = "C:\cash-flow-app"
    Ecosystem  = ""
    HealthPath = "/"
  }
)
