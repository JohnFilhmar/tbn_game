#!/usr/bin/env bash
# Restarts containers of the production stack that Docker reports as unhealthy. Docker restarts a
# crashed container by itself (restart: unless-stopped) but never an unhealthy one. The systemd
# timer tbn_restart_unhealthy.timer runs this every minute; see docs/server_setup.md.
set -euo pipefail

readonly project="${TBN_COMPOSE_PROJECT:-tbn}"

docker ps --filter "label=com.docker.compose.project=$project" --filter health=unhealthy \
  --format '{{.ID}} {{.Names}}' |
  while read -r id name; do
    logger --tag tbn_restart_unhealthy "Restarting unhealthy container $name"
    docker restart -t 30 "$id" > /dev/null
  done
