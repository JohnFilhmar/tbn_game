#!/usr/bin/env bash
# Backs up the tbn stack: a pg_dump custom-format dump of the database and a tarball of the
# workspace volume, in one dated directory under BACKUP_DIR with their checksums. Keeps the newest
# BACKUP_KEEP sets. On any failure it sends the owner a backup_failed notice through the stack's
# notification channels and exits non-zero. The systemd timer tbn_backup.timer runs it weekly;
# docs/server_setup.md installs it and documents the restore.
set -euo pipefail
umask 077

readonly project="${TBN_COMPOSE_PROJECT:-tbn}"
readonly backup_dir="${BACKUP_DIR:-/var/backups/tbn}"
readonly keep="${BACKUP_KEEP:-4}"
step="starting"

log() {
  echo "tbn_backup: $*"
}

# The id of the running container of one service of the stack, or nothing.
container_of() {
  docker ps --filter "label=com.docker.compose.project=$project" \
    --filter "label=com.docker.compose.service=$1" --format '{{.ID}}' | head -n 1
}

# Tells the owner through the stack itself; the web container has the database settings.
notify_failure() {
  local web reason
  reason="The weekly backup failed while $step on $(hostname)."
  web=$(container_of web)
  if [[ -z "$web" ]]; then
    log "cannot send the failure notice: the web container is not running"
    return
  fi
  docker exec "$web" /nodejs/bin/node dist/admin.js backup_failed "$reason" > /dev/null ||
    log "the failure notice could not be recorded"
}

on_error() {
  local code=$?
  log "failed while $step"
  [[ -n "${partial:-}" && -d "$partial" ]] && rm -rf "$partial"
  notify_failure
  exit "$code"
}
trap on_error ERR

[[ "$keep" =~ ^[1-9][0-9]*$ ]] || {
  step="reading BACKUP_KEEP"
  false
}

step="finding the database"
postgres=$(container_of postgres)
[[ -n "$postgres" ]]
image=$(docker inspect --format '{{.Config.Image}}' "$postgres")

stamp=$(date -u +%Y%m%dT%H%M%SZ)
final="$backup_dir/tbn_$stamp"
partial="$final.partial"
step="creating $partial"
install -d -m 0700 "$backup_dir"
install -d -m 0700 "$partial"

step="dumping the database"
docker exec "$postgres" pg_dump --username=tbn --dbname=tbn --format=custom > "$partial/database.dump"
step="checking the database dump"
docker exec -i "$postgres" pg_restore --list < "$partial/database.dump" > /dev/null

step="archiving the workspace volume"
docker run --rm --network none --entrypoint tar --volume "${project}_workspace:/workspace:ro" \
  "$image" --create --gzip --numeric-owner --directory /workspace . > "$partial/workspace.tar.gz"
step="checking the workspace archive"
gzip --test "$partial/workspace.tar.gz"

step="writing the checksums"
(cd "$partial" && sha256sum database.dump workspace.tar.gz > SHA256SUMS)
mv "$partial" "$final"
partial=""
log "wrote $final ($(du -sh "$final" | cut -f1))"

step="removing old backups"
mapfile -t sets < <(find "$backup_dir" -mindepth 1 -maxdepth 1 -type d -name 'tbn_*' ! -name '*.partial' | sort)
if ((${#sets[@]} > keep)); then
  for old in "${sets[@]:0:${#sets[@]}-keep}"; do
    rm -rf "$old"
    log "removed $old"
  done
fi
