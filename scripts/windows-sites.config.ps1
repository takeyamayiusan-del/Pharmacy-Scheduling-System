# Shared multi-site config for boot + watchdog
# Edit the second site Name / Port / Root to match your machine.

$Global:YaoshengHostConfig = @{
  # If $true, also restart any pm2 app that is stopped/errored (keeps both sites up together)
  WatchAllPm2 = $true

  # Supabase (shared by pharmacy). Set $false if no site needs it.
  EnsureSupabase = $true
  SupabaseHealthUrl = "http://127.0.0.1:54321/auth/v1/health"

  # Funnel/serve: primary public port (usually pharmacy)
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
  # ---- second website: fill in real values ----
  @{
    Name       = "site2-web"                    # pm2 name
    Port       = 3001                           # must differ from 3000
    Root       = "C:\CHANGE_ME_SECOND_SITE"     # project folder
    Ecosystem  = "ecosystem.config.cjs"         # or "" if started without ecosystem
    HealthPath = "/"                            # health check path
  }
)
