#!/usr/bin/env bash
# Brings the development stack up healthy. The sandbox image is built first, because the launcher
# creates containers from it and reports unhealthy until it exists. Pass extra compose arguments
# after the script name, for example a service list.
set -euo pipefail

cd "$(dirname "$0")/.."

echo "Building the sandbox image"
docker build --file Dockerfile.sandbox --tag tbn/sandbox:development .

echo "Starting the stack"
DOCKER_GID=${DOCKER_GID:-$(stat -c %g /var/run/docker.sock)} \
  docker compose -f docker-compose.development.yml up --build --wait "$@"
