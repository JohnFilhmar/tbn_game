#!/usr/bin/env bash
# The phase 3 demo: the whole company from the browser. It checks that the development stack serves
# the desktop, that Prometheus scrapes every process and Grafana shows the dashboard, that the
# owner's account signs in, and that a backup can be made; then it prints the steps to follow in
# the browser with a real key. Run it on the machine that runs the development stack:
#
#   scripts/stack_up.sh
#   docker compose -f docker-compose.development.yml run --rm --no-deps web \
#     /app/node_modules/prisma/build/index.js migrate deploy
#   printf '%s' "$PASSWORD" | docker compose -f docker-compose.development.yml run --rm -T web \
#     dist/admin.js owner_create john
#   TBN_USERNAME=john TBN_PASSWORD="$PASSWORD" scripts/demo_phase_3.sh
#
# Create the owner once; skip that line when it exists. The script exits non-zero when a check
# fails. Settings, all overridable: TBN_URL, TBN_GRAFANA_URL, TBN_GRAFANA_PASSWORD and
# TBN_COMPOSE_FILE (docker-compose.development.yml).
set -euo pipefail

cd "$(dirname "$0")/.."

url=${TBN_URL:-http://127.0.0.1:3000}
grafana_url=${TBN_GRAFANA_URL:-http://127.0.0.1:3005}
grafana_password=${TBN_GRAFANA_PASSWORD:-grafana_development_only}
username=${TBN_USERNAME:?set TBN_USERNAME}
password=${TBN_PASSWORD:?set TBN_PASSWORD}
compose=(docker compose -f "${TBN_COMPOSE_FILE:-docker-compose.development.yml}")

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

echo "The web process is healthy and serves the desktop under /app"
curl -fsS --max-time 5 "$url/health" | jq -e '.status == "ok"' > /dev/null || fail "$url/health"
curl -fsS --max-time 5 "$url/app/agents" | grep -q '<div id="root">' || fail "$url/app/ has no client"

echo "The owner signs in"
curl -fsS -X POST "$url/auth/login" -H 'Content-Type: application/json' \
  --data "$(jq -cn --arg u "$username" --arg p "$password" '{username: $u, password: $p}')" |
  jq -e '.token | length > 0' > /dev/null || fail "the owner's account did not sign in"

echo "Prometheus scrapes web, worker, sandbox and egress_proxy"
"${compose[@]}" exec -T prometheus wget -qO- http://127.0.0.1:9090/api/v1/targets |
  jq -e '[.data.activeTargets[] | select(.health == "up")] | length == 4' > /dev/null ||
  fail "not every scrape target is up; wait a minute after the stack starts and run again"

echo "Grafana is healthy and has the tbn overview dashboard"
curl -fsS --max-time 5 --user "admin:$grafana_password" "$grafana_url/api/search?query=tbn%20overview" |
  jq -e 'any(.[]; .uid == "tbn_overview")' > /dev/null || fail "Grafana or its dashboard is missing"

echo "One backup of the database and the workspace"
backup_dir=$(mktemp -d)
TBN_COMPOSE_PROJECT=$("${compose[@]}" config --format json | jq -r .name) BACKUP_DIR="$backup_dir" \
  deploy/backup/tbn_backup.sh
ls -l "$backup_dir"/tbn_*/

cat <<STEPS

Everything is up. Now run the company from the browser:

  1. Open $url/app/ and sign in as $username.
  2. Providers, Add a provider: your API's base URL, your key and one or two models. The key is
     encrypted on the server and never shown again.
  3. Agents, Recruit: a name, a role and a job description, the provider and its models. Under
     Tool policy, add list_roster with "Asks you first" to see an approval.
  4. The new agent opens on its chat. Write to it and watch the reply arrive as it is written.
  5. Tasks, Assign a task to it. The task screen follows it live: in progress, awaiting approval.
  6. Approvals: the launcher counts the waiting call. Read its input, add a note, approve.
  7. When the task is done, open it and Read the report; Download .md saves it.
  8. Every other screen is in the launcher: departments, repositories, merge requests, sandbox
     jobs, search, integrations with notification channels, plugins, skills, instructions,
     preferences and cache savings. Preferences, Theme switches light and dark.
  9. Grafana at $grafana_url (admin / the Grafana password): the tbn overview dashboard shows the
     processes, queues, runs, spend, cache hit rate, proxy refusals and the disk.

The backup is in $backup_dir; remove it when you are done.
STEPS
