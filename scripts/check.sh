#!/usr/bin/env bash
# One-shot health check for the whole ParcelFlow stack.
#   npm run check
# Exits 0 when everything is fine, 1 otherwise. Read-only: creates nothing.

BASE="${BASE_URL:-http://localhost:3000}"
pass=0; fail=0
ok()   { printf "  \033[32m✓\033[0m %s\n" "$1"; pass=$((pass+1)); }
bad()  { printf "  \033[31m✗\033[0m %s\n     \033[33m→ %s\033[0m\n" "$1" "$2"; fail=$((fail+1)); }

echo
echo "ParcelFlow stack check  ($BASE)"
echo "──────────────────────────────────────────────────────────"

# 1. Docker daemon
if docker info >/dev/null 2>&1; then ok "Docker daemon running"
else bad "Docker daemon not running" "open -a Docker, then re-run"; fi

# 2/3. Containers
for c in parcelflow-postgres parcelflow-redis; do
  status=$(docker inspect --format '{{.State.Health.Status}}' "$c" 2>/dev/null)
  case "$status" in
    healthy)  ok "$c healthy" ;;
    starting) bad "$c still starting" "wait a few seconds and re-run" ;;
    "")       [ "$c" = "parcelflow-redis" ] \
                && ok "$c not running (optional — in-memory rate limiting)" \
                || bad "$c not running" "npm run db:up" ;;
    *)        bad "$c is $status" "docker logs $c" ;;
  esac
done

# 4. Port
if lsof -nP -iTCP:"${BASE##*:}" -sTCP:LISTEN >/dev/null 2>&1; then ok "port ${BASE##*:} listening"
else bad "nothing listening on port ${BASE##*:}" "npm run dev"; fi

# 5. Shallow health
body=$(curl -fsS --max-time 3 "$BASE/health" 2>/dev/null)
if [ -n "$body" ]; then ok "API alive — $(echo "$body" | sed 's/.*uptimeSeconds"://;s/}}//') s uptime"
else bad "API not responding" "npm run dev"; fi

# 6. Deep health
code=$(curl -s -o /tmp/pf_db.$$ -w '%{http_code}' --max-time 5 "$BASE/health/db" 2>/dev/null)
if [ "$code" = "200" ]; then ok "database reachable"
elif [ "$code" = "503" ]; then bad "database unreachable (503)" "npm run db:up"
else bad "deep health check failed (HTTP ${code:-none})" "is the API running?"; fi
rm -f /tmp/pf_db.$$

# 7. Real request end to end
tok=$(curl -fsS --max-time 5 -X POST "$BASE/auth/login" -H 'Content-Type: application/json' \
      -d '{"email":"admin@parcelflow.dev","password":"123"}' 2>/dev/null \
      | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
if [ -n "$tok" ]; then
  ok "login works (JWT issued)"
  n=$(curl -fsS --max-time 5 "$BASE/parcels" -H "Authorization: Bearer $tok" 2>/dev/null \
      | sed -n 's/.*"total":\([0-9]*\).*/\1/p')
  [ -n "$n" ] && ok "authenticated read works ($n parcels visible to admin)" \
              || bad "authenticated read failed" "check the API logs"
else
  bad "login failed" "seeded? run: npm run db:seed"
fi

echo "──────────────────────────────────────────────────────────"
if [ "$fail" -eq 0 ]; then
  printf "  \033[32mALL GOOD\033[0m — %d checks passed\n\n" "$pass"; exit 0
else
  printf "  \033[31m%d PROBLEM(S)\033[0m, %d passed — see the → hints above\n\n" "$fail" "$pass"; exit 1
fi