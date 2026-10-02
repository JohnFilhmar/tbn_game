#!/usr/bin/env bash
# Checks a running development stack, brought up with
#   docker compose -f docker-compose.development.yml up --build --wait
# Every service must be healthy, both /health endpoints must report the database ok, /metrics must
# answer, the migration release step must run, the sandbox must reach nothing, and web and worker
# must exit 0 on SIGTERM. The last check stops web and worker.
set -euo pipefail

compose=(docker compose -f docker-compose.development.yml)

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

echo "Every service is healthy"
not_healthy=$("${compose[@]}" ps --format json | jq -rs '.[] | select(.Health != "healthy") | .Service')
[[ -z "$not_healthy" ]] || fail "not healthy: $not_healthy"
[[ $("${compose[@]}" ps --format json | jq -s 'length') -eq 6 ]] || fail "expected 6 running services"

for endpoint in web:3000 worker:3001; do
  process_type=${endpoint%%:*}
  port=${endpoint#*:}
  echo "GET /health and /metrics on $process_type"
  body=$(curl -fsS --max-time 5 "http://127.0.0.1:$port/health")
  jq -e --arg process_type "$process_type" \
    '.status == "ok" and .checks.database == "ok" and .process_type == $process_type' \
    <<<"$body" >/dev/null || fail "unexpected /health body from $process_type: $body"
  curl -fsS --max-time 5 "http://127.0.0.1:$port/metrics" | grep -q "process_type=\"$process_type\"" ||
    fail "/metrics on $process_type has no process_type label"
done

echo "Release step: prisma migrate deploy"
"${compose[@]}" run --rm --no-deps web /app/node_modules/prisma/build/index.js migrate deploy

for target in web:3000 worker:3001 postgres:5432 searxng:8080 1.1.1.1:443; do
  echo "Sandbox cannot reach $target"
  if "${compose[@]}" exec -T sandbox bash -c \
    "timeout 3 bash -c 'exec 3<>/dev/tcp/${target%:*}/${target#*:}'" 2>/dev/null; then
    fail "the sandbox reached $target"
  fi
done

echo "web and worker exit 0 on SIGTERM"
"${compose[@]}" stop web worker
for service in web worker; do
  exit_code=$(docker inspect -f '{{.State.ExitCode}}' "$("${compose[@]}" ps -a -q "$service")")
  [[ "$exit_code" == 0 ]] || fail "$service exited with code $exit_code"
done

echo "Smoke test passed"
