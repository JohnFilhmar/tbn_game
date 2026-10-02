#!/usr/bin/env bash
# Checks a running development stack, brought up with scripts/stack_up.sh. Every service must be
# healthy, every /health endpoint must report its checks ok, /metrics must answer, the migration
# release step must run, a container on the sandbox network must reach nothing but the proxy, the
# proxy must refuse every private destination, and the four backend processes must exit 0 on
# SIGTERM. The last check stops them.
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
[[ $("${compose[@]}" ps --format json | jq -s 'length') -eq 7 ]] || fail "expected 7 running services"

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
