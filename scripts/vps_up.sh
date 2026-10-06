#!/usr/bin/env bash
# Builds the backend and sandbox images from this checkout and brings the production stack up,
# without the signed-image deploy workflow. It is the temporary way to run the stack on the shared
# VPS; docs/vps_setup.md explains it. Run it from a clone after every `git pull`.
# The secrets come from TBN_ENV_FILE, /etc/tbn/tbn.env by default, which the owner creates.
set -euo pipefail

env_file=${TBN_ENV_FILE:-/etc/tbn/tbn.env}
if [[ ! -r "$env_file" ]]; then
  echo "Missing $env_file. docs/vps_setup.md shows how to create it." >&2
  exit 1
fi
if [[ $(stat -c %a "$env_file") != 600 ]]; then
  echo "$env_file holds secrets and must be readable by its owner only: chmod 600 $env_file" >&2
  exit 1
fi

cd "$(dirname "$0")/.."
commit=$(git rev-parse HEAD)
docker_gid=$(stat -c %g /var/run/docker.sock)
export BACKEND_IMAGE=tbn/backend:vps SANDBOX_IMAGE=tbn/sandbox:vps DOCKER_GID=$docker_gid

docker build --build-arg GIT_COMMIT_SHA="$commit" --tag "$BACKEND_IMAGE" .
docker build --file Dockerfile.sandbox --tag "$SANDBOX_IMAGE" .

compose=(docker compose --env-file "$env_file" -f docker-compose.production.yml)
# On a box with the shared model network, the worker joins it to reach the guest model.
if docker network inspect llm_gateway > /dev/null 2>&1; then
  compose+=(-f docker-compose.vps.yml)
fi
"${compose[@]}" up --detach --wait postgres
# The release step: migrations run once here, never on application boot.
"${compose[@]}" run --rm --no-deps web /app/node_modules/prisma/build/index.js migrate deploy
"${compose[@]}" up --detach --wait --wait-timeout 300 --remove-orphans

address=$("${compose[@]}" port web 3000)
curl -fsS --max-time 5 "http://$address/health"
echo
echo "The stack runs commit $commit, with the web process on $address."
