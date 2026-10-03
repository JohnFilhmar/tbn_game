#!/usr/bin/env bash
# The phase 4 demo: the company as a 3D world. It checks that the development stack serves the
# client with the three environment packs and the character set, that the owner's account signs
# in, and that the world's preferences take their values; then it prints the steps to follow in the
# browser. Run it on the machine that runs the development stack:
#
#   scripts/stack_up.sh
#   docker compose -f docker-compose.development.yml run --rm --no-deps web \
#     /app/node_modules/prisma/build/index.js migrate deploy
#   printf '%s' "$PASSWORD" | docker compose -f docker-compose.development.yml run --rm -T web \
#     dist/admin.js owner_create john
#   TBN_USERNAME=john TBN_PASSWORD="$PASSWORD" scripts/demo_phase_4.sh
#
# Create the owner once; skip that line when it exists. The script exits non-zero when a check
# fails. Settings, all overridable: TBN_URL.
set -euo pipefail

cd "$(dirname "$0")/.."

url=${TBN_URL:-http://127.0.0.1:3000}
username=${TBN_USERNAME:?set TBN_USERNAME}
password=${TBN_PASSWORD:?set TBN_PASSWORD}

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

work_dir=$(mktemp -d)
trap 'rm -rf "$work_dir"' EXIT

echo "The web process is healthy and serves the client under /app"
curl -fsS --max-time 5 "$url/health" | jq -e '.status == "ok"' > /dev/null || fail "$url/health"
curl -fsS --max-time 5 "$url/app/" > "$work_dir/index.html" || fail "$url/app/ did not answer"
grep -q '<div id="root">' "$work_dir/index.html" || fail "$url/app/ has no client"

echo "The world's packs and the character set ship with the client"
# The world loads on demand, so its chunks are named inside the ones the page loads first.
grep -o '/app/assets/[A-Za-z0-9_.-]*\.js' "$work_dir/index.html" | sort -u > "$work_dir/chunks"
for _ in 1 2; do
  while read -r chunk; do
    curl -fsS --max-time 10 "$url$chunk" >> "$work_dir/code.js" || fail "$chunk did not load"
  done < "$work_dir/chunks"
  grep -o '[A-Za-z0-9_-]*\.js' "$work_dir/code.js" | sed 's#^#/app/assets/#' | sort -u |
    comm -13 "$work_dir/chunks" - > "$work_dir/next" || true
  mv "$work_dir/next" "$work_dir/chunks"
  [ -s "$work_dir/chunks" ] || break
done
grep -o '/app/assets/[A-Za-z0-9_-]*\.glb' "$work_dir/code.js" | sort -u > "$work_dir/models"
model_count=$(wc -l < "$work_dir/models")
[ "$model_count" -ge 21 ] || fail "expected the 6 pack files and 15 character files, found $model_count models"
while read -r model; do
  curl -fsS --max-time 10 -o /dev/null "$url$model" || fail "$model did not load"
done < "$work_dir/models"
echo "  $model_count models load"

echo "The owner signs in"
token=$(curl -fsS -X POST "$url/auth/login" -H 'Content-Type: application/json' \
  --data "$(jq -cn --arg u "$username" --arg p "$password" '{username: $u, password: $p}')" |
  jq -r .token)
if [ -z "$token" ] || [ "$token" = null ]; then fail "the owner's account did not sign in"; fi
api() {
  local method=$1 path=$2 body=${3:-}
  if [ -n "$body" ]; then
    curl -fsS --max-time 10 -H "Authorization: Bearer $token" -H 'Content-Type: application/json' \
      -H "Idempotency-Key: $(cat /proc/sys/kernel/random/uuid)" -X "$method" "$url$path" --data "$body"
  else
    curl -fsS --max-time 10 -H "Authorization: Bearer $token" \
      -H "Idempotency-Key: $(cat /proc/sys/kernel/random/uuid)" -X "$method" "$url$path"
  fi
}

echo "The world's preferences take their values and come back"
before=$(api GET /preferences)
api PUT /preferences/environment '{"value":"warehouse"}' | jq -e '.environment == "warehouse"' > /dev/null ||
  fail "the environment preference did not take"
api PUT /preferences/time_of_day '{"value":"night"}' | jq -e '.time_of_day == "night"' > /dev/null ||
  fail "the time of day preference did not take"
api PUT /preferences/owner_appearance '{"value":{"body":"broad","hair":"bun","colors":{"top":"#2a9d8f"}}}' |
  jq -e '.owner_appearance.hair == "bun"' > /dev/null || fail "the owner appearance did not take"
api PUT /preferences/environment "$(jq -c '{value: .environment}' <<<"$before")" > /dev/null
api PUT /preferences/time_of_day "$(jq -c '{value: .time_of_day}' <<<"$before")" > /dev/null
api PUT /preferences/owner_appearance "$(jq -c '{value: .owner_appearance}' <<<"$before")" > /dev/null
api POST /auth/logout > /dev/null || true

cat <<STEPS

Everything is up. Now walk the company from the browser:

  1. Open $url/app/ and sign in as $username. You land in the world, in the office, by the door,
     at the hour your time zone preference says it is.
  2. Walk with WASD or the arrows, Shift to run; drag to look around, wheel to zoom. The panel at
     the bottom right says what every agent is doing, and writes each thing that happens.
  3. Press C, or the camera button, to see the office from above; press it again to come back.
  4. Walk up to the desk with the computer by the door until "Press E to use the computer"
     appears, then press E: the desk opens over the world. Escape, or World in its bar, returns.
  5. From the desk, recruit a manager if the company is empty: Providers, Add a provider, then
     Agents, Recruit. Its character arrives through the door and takes the first desk of its
     department's zone. The profile tab dresses it from the set's parts and colours.
  6. Assign it a task that makes it delegate: it walks to its desk and works; when it hands a part
     to an intern, the intern walks in, the manager walks over, waves and returns; the intern
     brings the result back and, once idle past the intern idle time in Preferences, leaves.
  7. World, in the HUD: Home or Warehouse moves everyone to their desks there at once; the time of
     day lights the room, and My clock follows your time zone.
  8. Customise, in the HUD: your own body, hair, outfit, accessory and colours, with a live
     preview, saved as a preference.
  9. The frame counter is in the HUD's top bar. Read it in each environment and camera.
STEPS
