#!/usr/bin/env bash
# Fails when a compose file publishes a port on anything other than 127.0.0.1. Docker bypasses host
# firewall rules for published ports, so a port on all interfaces would be reachable from outside.
# Usage: scripts/check_compose_ports.sh docker-compose.development.yml [more files...]
# Required interpolation variables must be set in the environment for files that use them.
set -euo pipefail

status=0
for file in "$@"; do
  exposed=$(docker compose -f "$file" config --format json | jq -r '
    .services | to_entries[] | .key as $service
    | (.value.ports // [])[]
    | select(.host_ip != "127.0.0.1")
    | "\($service) publishes \(.published) on \(.host_ip // "every interface")"')
  if [[ -n "$exposed" ]]; then
    echo "$file:" >&2
    echo "$exposed" >&2
    status=1
  else
    echo "$file: every published port binds to 127.0.0.1"
  fi
done
exit "$status"
