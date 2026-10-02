#!/usr/bin/env bash
# The phase 2 demo: a scripted client follows a manager's task over the realtime gateway, loses its
# connection mid-run and resumes from its cursor, while the owner chats with the busy agent through
# a command sent twice under one Idempotency-Key. Run it on the machine that runs the development
# stack:
#
#   scripts/stack_up.sh
#   docker compose -f docker-compose.development.yml run --rm --no-deps web \
#     /app/node_modules/prisma/build/index.js migrate deploy
#   printf '%s' "$PASSWORD" | docker compose -f docker-compose.development.yml run --rm -T web \
#     dist/admin.js owner_create john
#   TBN_USERNAME=john TBN_PASSWORD="$PASSWORD" ANTHROPIC_API_KEY=... ANTHROPIC_MODEL=... \
#     scripts/demo_phase_2.sh
#
# Create the owner once; skip that line when it exists.
#
# The script adds the provider, recruits a manager and gives it a task of several turns over HTTP.
# The client is dist/realtime_client.js, run in a one-off container from the web image, so the
# host needs nothing but docker, curl and jq. It connects from the cursor read before the task,
# drops once the agent has replied, sends the owner's message twice under one command id while
# away, reconnects, and waits for the task to end. It then sets what it received against
# GET /events, every sequence once and in order, and each streamed reply against the stored one.
# The script exits non-zero when a check fails.
#
# Settings, all overridable: TBN_URL, ANTHROPIC_BASE_URL, TBN_TIMEOUT_SECONDS (600) and
# TBN_COMPOSE_FILE (docker-compose.development.yml).
set -euo pipefail

url=${TBN_URL:-http://127.0.0.1:3000}
username=${TBN_USERNAME:?set TBN_USERNAME}
password=${TBN_PASSWORD:?set TBN_PASSWORD}
main_key=${ANTHROPIC_API_KEY:?set ANTHROPIC_API_KEY}
main_base=${ANTHROPIC_BASE_URL:-https://api.anthropic.com}
main_model=${ANTHROPIC_MODEL:?set ANTHROPIC_MODEL}
timeout_seconds=${TBN_TIMEOUT_SECONDS:-600}
compose=(docker compose -f "${TBN_COMPOSE_FILE:-docker-compose.development.yml}")
message='A note from the owner while you work: end every part with one line on where that tea grows.'
stamp=$(date +%s)

api() {
  local method=$1 path=$2 body=${3:-}
  if [[ -n "$body" ]]; then
    curl -fsS -X "$method" "$url$path" -H "Authorization: Bearer $token" \
      -H 'Content-Type: application/json' --data "$body"
  else
    curl -fsS -X "$method" "$url$path" -H "Authorization: Bearer $token"
  fi
}

echo "Logging in as $username"
token=$(curl -fsS -X POST "$url/auth/login" -H 'Content-Type: application/json' \
  --data "$(jq -cn --arg u "$username" --arg p "$password" '{username: $u, password: $p}')" | jq -r .token)

echo "Adding the provider"
provider_id=$(api POST /providers "$(jq -cn \
  --arg name "main-$stamp" --arg base "$main_base" --arg key "$main_key" --arg model "$main_model" \
  '{name: $name, api_format: "anthropic_messages", base_url: $base, api_key: $key,
    models: [{model_id: $model, cost_tier: "premium"}]}')" | jq -r .id)

echo "Recruiting a manager"
manager_id=$(api POST /agents "$(jq -cn --arg name "tea-writer-$stamp" --arg provider "$provider_id" \
  --arg model "$main_model" \
  '{name: $name, role: "Tea writer", job_description: "Writes short guides and reports to the owner.",
    provider_id: $provider, primary_model: $model, intern_model: $model}')" | jq -r .id)

# A pruned log answers 410 with the same head_seq, so the status is not checked here.
cursor=$(curl -sS "$url/events?limit=1" -H "Authorization: Bearer $token" | jq -r .head_seq)
echo "The event log's head is $cursor; the client resumes from there"

echo "Assigning a task of several turns"
task_id=$(api POST /tasks "$(jq -cn --arg agent "$manager_id" \
  '{title: "Three part tea note", assignee_agent_id: $agent,
    instructions: "Write a three part note on tea, one part per turn, in exactly these steps. Before every tool call, say in one or two sentences what you are about to do.\n1. Call list_roster.\n2. Write about 80 words on green tea to notes/tea/green.md with write_file.\n3. Write about 80 words on black tea to notes/tea/black.md with write_file.\n4. Write about 80 words on oolong to notes/tea/oolong.md with write_file.\n5. Call finish_task with a short report."}')" | jq -r .id)

echo "Starting the scripted client"
set +e
printf '%s' "$token" | "${compose[@]}" run --rm --no-deps -T web dist/realtime_client.js \
  --url http://web:3000 --agent "$manager_id" --task "$task_id" --cursor "$cursor" \
  --message "$message" --timeout_seconds "$timeout_seconds"
client_status=$?
set -e

echo "The agent's transcript from the owner's message on:"
api GET "/agents/$manager_id/transcript?limit=500" | jq -r '
  (map(.kind == "owner_message") | index(true)) as $at
  | if $at == null then "  (the message is not in the transcript)"
    else .[$at:][] | if .kind == "owner_message" then "  owner: \(.content.text)"
      elif .kind == "assistant" then
        "  agent: " + ([.content.blocks[] | if .type == "text" then .text else "[\(.name)]" end] | join(" "))
      else "  \(.kind)" end
    end'

[[ "$client_status" -eq 0 ]]
