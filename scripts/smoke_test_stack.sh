#!/usr/bin/env bash
# Checks a running development stack, brought up with scripts/stack_up.sh. Every service must be
# healthy, every /health endpoint must report its checks ok, /metrics must answer, the web process
# must serve the client, Prometheus must scrape all four processes, Grafana must be healthy with
# its data source and dashboard, one backup must succeed, the migration release step must run, a
# container on the sandbox network must reach nothing but the proxy, the proxy must refuse every
# private destination, and the four backend processes must exit 0 on SIGTERM. The last check stops
# them.
set -euo pipefail

compose=(docker compose -f docker-compose.development.yml)
sandbox_image=tbn/sandbox:development
sandbox_network=tbn_development_sandbox

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

# The address of a service on the backend network.
service_ip() {
  docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' "$("${compose[@]}" ps -q "$1")"
}

# Runs a command in a sandbox container the way the launcher does, and prints its output.
sandbox_run() {
  docker run --rm --network "$sandbox_network" --read-only --cap-drop ALL \
    --security-opt no-new-privileges --user 65532:65532 --tmpfs /tmp "$sandbox_image" bash -c "$1"
}

echo "Every service is healthy"
not_healthy=$("${compose[@]}" ps --format json | jq -rs '.[] | select(.Health != "healthy") | .Service')
[[ -z "$not_healthy" ]] || fail "not healthy: $not_healthy"
[[ $("${compose[@]}" ps --format json | jq -s 'length') -eq 8 ]] || fail "expected 8 running services"

for endpoint in web:3000 worker:3001 sandbox:3002 egress_proxy:3003; do
  process_type=${endpoint%%:*}
  port=${endpoint#*:}
  echo "GET /health and /metrics on $process_type"
  body=$(curl -fsS --max-time 5 "http://127.0.0.1:$port/health")
  jq -e --arg process_type "$process_type" \
    '.status == "ok" and .process_type == $process_type and all(.checks[]; . == "ok")' \
    <<<"$body" >/dev/null || fail "unexpected /health body from $process_type: $body"
  curl -fsS --max-time 5 "http://127.0.0.1:$port/metrics" | grep -q "process_type=\"$process_type\"" ||
    fail "/metrics on $process_type has no process_type label"
done

echo "The web process serves the client under /app"
curl -fsS --max-time 5 http://127.0.0.1:3000/app/agents | grep -q '<div id="root">' ||
  fail "/app/agents is not the client page"
[[ $(curl -s -o /dev/null -w '%{redirect_url}' http://127.0.0.1:3000/) == */app/ ]] ||
  fail "/ does not redirect to /app/"

echo "Prometheus scrapes web, worker, sandbox and egress_proxy"
targets_up=0
for _ in $(seq 30); do
  targets_up=$("${compose[@]}" exec -T prometheus wget -qO- http://127.0.0.1:9090/api/v1/targets |
    jq '[.data.activeTargets[] | select(.health == "up")] | length')
  [[ "$targets_up" -eq 4 ]] && break
  sleep 2
done
[[ "$targets_up" -eq 4 ]] || fail "expected 4 scrape targets up, got $targets_up"

echo "Grafana is healthy, reads Prometheus and has the dashboard"
grafana=(curl -fsS --max-time 5 --user admin:grafana_development_only)
curl -fsS --max-time 5 http://127.0.0.1:3005/api/health | jq -e '.database == "ok"' > /dev/null ||
  fail "Grafana is not healthy"
"${grafana[@]}" http://127.0.0.1:3005/api/datasources/uid/tbn_prometheus/health |
  jq -e '.status == "OK"' > /dev/null || fail "Grafana cannot query Prometheus"
"${grafana[@]}" 'http://127.0.0.1:3005/api/search?query=tbn%20overview' |
  jq -e 'any(.[]; .uid == "tbn_overview")' > /dev/null || fail "the tbn overview dashboard is missing"

echo "One backup of the database and the workspace"
backup_dir=$(mktemp -d)
TBN_COMPOSE_PROJECT=tbn_development BACKUP_DIR="$backup_dir" deploy/backup/tbn_backup.sh
backup_set=$(find "$backup_dir" -mindepth 1 -maxdepth 1 -type d -name 'tbn_*')
[[ -n "$backup_set" ]] || fail "the backup wrote no set"
(cd "$backup_set" && sha256sum --check --quiet SHA256SUMS) || fail "the backup checksums do not match"
rm -rf "$backup_dir"

echo "Release step: prisma migrate deploy"
"${compose[@]}" run --rm --no-deps web /app/node_modules/prisma/build/index.js migrate deploy

backend_gateway=$(docker network inspect -f '{{(index .IPAM.Config 0).Gateway}}' tbn_development_backend)
for target in "$(service_ip web):3000" "$(service_ip worker):3001" "$(service_ip postgres):5432" \
  "$(service_ip searxng):8080" "$backend_gateway:3000" "$backend_gateway:5432" 1.1.1.1:443; do
  echo "A sandbox container cannot reach $target"
  if sandbox_run "timeout 3 bash -c 'exec 3<>/dev/tcp/${target%:*}/${target#*:}'" 2>/dev/null; then
    fail "the sandbox reached $target"
  fi
done

echo "A sandbox container reaches the proxy, which wants a run identity"
code=$(sandbox_run "curl -s -o /dev/null -w '%{http_code}' --proxy http://egress_proxy:3128 http://example.com/")
[[ "$code" == 407 ]] || fail "expected 407 from the proxy without an identity, got $code"

for destination in http://postgres:5432/ http://web:3000/health "http://$backend_gateway:3000/" \
  http://127.0.0.1:3000/ http://169.254.169.254/ http://10.0.0.1/ http://100.64.0.1/; do
  echo "The proxy refuses $destination"
  code=$(sandbox_run "curl -s -o /dev/null -w '%{http_code}' --proxy http://smoke:smoke@egress_proxy:3128 $destination")
  [[ "$code" == 403 ]] || fail "expected 403 from the proxy for $destination, got $code"
done

echo "The proxy forwards to the open web"
code=$(sandbox_run "curl -s -o /dev/null -w '%{http_code}' --proxy http://smoke:smoke@egress_proxy:3128 https://example.com/")
[[ "$code" == 200 ]] || fail "expected 200 from example.com through the proxy, got $code"

echo "web, worker, sandbox and egress_proxy exit 0 on SIGTERM"
"${compose[@]}" stop web worker sandbox egress_proxy
for service in web worker sandbox egress_proxy; do
  exit_code=$(docker inspect -f '{{.State.ExitCode}}' "$("${compose[@]}" ps -a -q "$service")")
  [[ "$exit_code" == 0 ]] || fail "$service exited with code $exit_code"
done

echo "Smoke test passed"
