#!/usr/bin/env bash
# The phase 1a demo over HTTP: add two providers, recruit two level 1 agents on different providers,
# assign each a writing task, and download both reports. Run it against the development stack:
#
#   docker compose -f docker-compose.development.yml up --build --wait
#   printf '%s' "$PASSWORD" | docker compose -f docker-compose.development.yml run --rm -T web \
#     dist/admin.js owner_create john
#   TBN_USERNAME=john TBN_PASSWORD="$PASSWORD" ANTHROPIC_API_KEY=... OPENAI_API_KEY=... \
#     scripts/demo_phase_1a.sh
#
# Settings, all overridable: TBN_URL, ANTHROPIC_BASE_URL, ANTHROPIC_MODEL, ANTHROPIC_CHEAP_MODEL,
# OPENAI_BASE_URL (point it at Ollama's /v1 for a local model), OPENAI_MODEL, OPENAI_CHEAP_MODEL.
# Reports land in ./demo_reports/. Needs curl and jq.
set -euo pipefail

url=${TBN_URL:-http://127.0.0.1:3000}
username=${TBN_USERNAME:?set TBN_USERNAME}
password=${TBN_PASSWORD:?set TBN_PASSWORD}
anthropic_key=${ANTHROPIC_API_KEY:?set ANTHROPIC_API_KEY}
openai_key=${OPENAI_API_KEY:?set OPENAI_API_KEY}
anthropic_base=${ANTHROPIC_BASE_URL:-https://api.anthropic.com}
openai_base=${OPENAI_BASE_URL:-https://api.openai.com/v1}
anthropic_model=${ANTHROPIC_MODEL:?set ANTHROPIC_MODEL}
anthropic_cheap=${ANTHROPIC_CHEAP_MODEL:-$anthropic_model}
openai_model=${OPENAI_MODEL:?set OPENAI_MODEL}
openai_cheap=${OPENAI_CHEAP_MODEL:-$openai_model}
timeout_seconds=${TBN_TIMEOUT_SECONDS:-900}
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

echo "Adding two providers"
anthropic_id=$(api POST /providers "$(jq -cn \
  --arg name "anthropic-$stamp" --arg base "$anthropic_base" --arg key "$anthropic_key" \
  --arg model "$anthropic_model" --arg cheap "$anthropic_cheap" \
  '{name: $name, api_format: "anthropic_messages", base_url: $base, api_key: $key,
    models: ([{model_id: $model, cost_tier: "premium"}, {model_id: $cheap, cost_tier: "cheap"}] | unique_by(.model_id))}')" | jq -r .id)
openai_id=$(api POST /providers "$(jq -cn \
  --arg name "openai-$stamp" --arg base "$openai_base" --arg key "$openai_key" \
  --arg model "$openai_model" --arg cheap "$openai_cheap" \
  '{name: $name, api_format: "openai_chat_completions", base_url: $base, api_key: $key,
    models: ([{model_id: $model, cost_tier: "standard"}, {model_id: $cheap, cost_tier: "cheap"}] | unique_by(.model_id))}')" | jq -r .id)

echo "Recruiting two level 1 agents"
ada_id=$(api POST /agents "$(jq -cn --arg name "ada-$stamp" --arg provider "$anthropic_id" \
  --arg model "$anthropic_model" --arg cheap "$anthropic_cheap" \
  '{name: $name, role: "Technical writer", job_description: "Writes clear short documents for the owner.",
    provider_id: $provider, primary_model: $model, intern_model: $cheap}')" | jq -r .id)
grace_id=$(api POST /agents "$(jq -cn --arg name "grace-$stamp" --arg provider "$openai_id" \
  --arg model "$openai_model" --arg cheap "$openai_cheap" \
  '{name: $name, role: "Copywriter", job_description: "Writes product copy and announcements.",
    provider_id: $provider, primary_model: $model, intern_model: $cheap}')" | jq -r .id)

echo "Assigning a writing task to each"
task_a=$(api POST /tasks "$(jq -cn --arg agent "$ada_id" \
  '{title: "Explain the company", assignee_agent_id: $agent,
    instructions: "Write a 200 word explanation of what this company does for a new hire. Save it as docs/company.md in the workspace, then finish the task with a report."}')" | jq -r .id)
task_b=$(api POST /tasks "$(jq -cn --arg agent "$grace_id" \
  '{title: "Launch announcement", assignee_agent_id: $agent,
    instructions: "Write a 150 word launch announcement for a note taking app called Quill. Save it as copy/quill_launch.md in the workspace, then finish the task with a report."}')" | jq -r .id)

echo "Waiting for both tasks (up to $timeout_seconds seconds)"
deadline=$((SECONDS + timeout_seconds))
for task in "$task_a" "$task_b"; do
  while :; do
    status=$(api GET "/tasks/$task" | jq -r .status)
    case "$status" in
      done) echo "Task $task is done"; break ;;
      failed | cancelled) echo "Task $task ended as $status"; api GET "/tasks/$task" | jq .; exit 1 ;;
    esac
    if ((SECONDS >= deadline)); then echo "Timed out waiting for task $task"; exit 1; fi
    sleep 5
  done
done

mkdir -p demo_reports
for task in "$task_a" "$task_b"; do
  report=$(api GET "/tasks/$task" | jq -r .report_id)
  api GET "/reports/$report/download" > "demo_reports/$task.md"
  echo "Downloaded demo_reports/$task.md"
done
echo "Usage on the Anthropic key:"
api GET "/providers/$anthropic_id/usage" | jq '{requests, input_tokens, output_tokens, cache_read_tokens, cost}'
echo "Usage on the OpenAI-compatible key:"
api GET "/providers/$openai_id/usage" | jq '{requests, input_tokens, output_tokens, cache_read_tokens, cost}'
