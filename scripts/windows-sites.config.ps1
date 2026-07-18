# Shared multi-site config for boot + watchdog
# Edit Name/Port if your pm2 list shows different values.

$Global:YaoshengHostConfig = @{
  # Restart any pm2 app that is stopped/errored (keeps both sites up together)
  WatchAllPm2 = $true

  # Supabase used by pharmacy scheduling
  EnsureSupabase = $true
  SupabaseHealthUrl = "http://127.0.0.1:54321/auth/v1/health"

  # Primary public Funnel port (pharmacy)
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
    Name       = "cash-flow-app"
    Port       = 3001
    Root       = "C:\cash-flow-app"
    Ecosystem  = "ecosystem.config.cjs"
    HealthPath = "/"
  }
)
