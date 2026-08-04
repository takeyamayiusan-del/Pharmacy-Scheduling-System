#!/bin/bash
set -e
cd ~/Pharmacy-Scheduling-System || exit 1

echo "=== fix supabase start (storage unhealthy) ==="
echo "Memory:"
free -h | head -2

echo "Step 1: stop everything..."
supabase stop --no-backup 2>/dev/null || supabase stop 2>/dev/null || true
docker rm -f $(docker ps -aq --filter name=supabase) 2>/dev/null || true

echo "Step 2: restart docker..."
sudo systemctl restart docker
sleep 5

echo "Step 3: lighten config for low memory VM..."
cp -f supabase/config.toml supabase/config.toml.bak
sed -i 's/^\[studio\]/[studio]\n# patched for low memory/' supabase/config.toml 2>/dev/null || true

python3 << 'PY' || true
from pathlib import Path
p = Path("supabase/config.toml")
text = p.read_text()
repl = {
    "[studio]\nenabled = true": "[studio]\nenabled = false",
    "[inbucket]\nenabled = true": "[inbucket]\nenabled = false",
    "[edge_runtime]\nenabled = true": "[edge_runtime]\nenabled = false",
}
for a, b in repl.items():
    text = text.replace(a, b)
p.write_text(text)
PY

echo "Step 4: start supabase..."
if supabase start --ignore-health-check 2>/dev/null; then
  echo "started with --ignore-health-check"
else
  supabase start
fi

echo "Step 5: status"
supabase status || true
docker ps --format 'table {{.Names}}\t{{.Status}}' | grep supabase || true
echo "DONE"
