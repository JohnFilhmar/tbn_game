#!/usr/bin/env bash
# Restores one backup set made by tbn_backup.sh into the tbn stack: it stops the processes that
# use the database and the workspace, restores the dump into a fresh database and swaps it in for
# `tbn`, replaces the workspace volume's content, and leaves the stack stopped for the owner to
# start. The database it replaced stays as tbn_replaced_<time> until the owner drops it. The
# database container must be running. docs/server_setup.md walks through it.
#
#   tbn_restore /var/backups/tbn/tbn_20261004T033000Z
set -euo pipefail

readonly project="${TBN_COMPOSE_PROJECT:-tbn}"
readonly set_dir="${1:?usage: tbn_restore <backup set directory> [--yes]}"
readonly confirmed="${2:-}"

fail() {
  echo "tbn_restore: $*" >&2
  exit 1
}

container_of() {
  docker ps --filter "label=com.docker.compose.project=$project" \
    --filter "label=com.docker.compose.service=$1" --format '{{.ID}}' | head -n 1
}

[[ -d "$set_dir" ]] || fail "$set_dir is not a directory"
(cd "$set_dir" && sha256sum --check --quiet SHA256SUMS) || fail "the checksums of $set_dir do not match"

postgres=$(container_of postgres)
[[ -n "$postgres" ]] || fail "start the database first: docker compose up --detach postgres"
image=$(docker inspect --format '{{.Config.Image}}' "$postgres")

if [[ "$confirmed" != "--yes" ]]; then
  echo "This replaces the database and the workspace of the $project stack with $set_dir."
  read -r -p "Type the project name ($project) to go on: " answer
  [[ "$answer" == "$project" ]] || fail "nothing was changed"
fi

echo "Stopping the processes that use the database and the workspace"
for service in web worker sandbox egress_proxy; do
  id=$(container_of "$service")
  [[ -z "$id" ]] || docker stop --time 30 "$id" > /dev/null
done

psql() {
  docker exec -i --env PGOPTIONS=--client-min-messages=warning "$postgres" \
    psql --username=tbn --dbname=postgres --quiet --no-psqlrc \
    --set=ON_ERROR_STOP=1 "$@"
}

echo "Restoring the database into tbn_restoring"
psql --command='DROP DATABASE IF EXISTS tbn_restoring'
psql --command='CREATE DATABASE tbn_restoring'
docker exec -i "$postgres" pg_restore --username=tbn --dbname=tbn_restoring --no-owner \
  --exit-on-error < "$set_dir/database.dump"

replaced="tbn_replaced_$(date -u +%Y%m%d_%H%M%S)"
echo "Swapping it in for tbn; the current database stays as $replaced"
psql --command="SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'tbn'" > /dev/null
psql --command="ALTER DATABASE tbn RENAME TO $replaced"
psql --command='ALTER DATABASE tbn_restoring RENAME TO tbn'

echo "Restoring the workspace volume"
docker run --rm -i --network none --entrypoint sh --volume "${project}_workspace:/workspace" "$image" \
  -c 'find /workspace -mindepth 1 -delete && tar --extract --gzip --numeric-owner --same-permissions --directory /workspace' \
  < "$set_dir/workspace.tar.gz"

echo "Restored $set_dir. Start the stack again with the deploy workflow, or on the server:"
echo "  docker compose --env-file <decrypted secrets> -f /opt/tbn/docker-compose.production.yml up --detach --wait"
echo "Once the restored stack looks right, drop the database it replaced:"
echo "  docker exec $postgres dropdb --username=tbn $replaced"
