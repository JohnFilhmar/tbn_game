#!/usr/bin/env bash
# The phase 1b demo over HTTP: one goal to a manager, who spawns an intern, reuses it, sends a new
# intern to the local provider once its key passes a cap threshold, and returns one condensed
# report; then the idle interns are terminated after the owner's timeout. Run it against the
# development stack:
#
#   docker compose -f docker-compose.development.yml up --build --wait
#   printf '%s' "$PASSWORD" | docker compose -f docker-compose.development.yml run --rm -T web \
#     dist/admin.js owner_create john
#   TBN_USERNAME=john TBN_PASSWORD="$PASSWORD" ANTHROPIC_API_KEY=... ANTHROPIC_MODEL=... \
#     LOCAL_BASE_URL=http://<host reachable from the worker>:11434/v1 LOCAL_MODEL=... \
#     scripts/demo_phase_1b.sh
#
# The main key speaks the Anthropic format; the local provider speaks the OpenAI format, as Ollama
# does at /v1. An owner who already has a local provider keeps it and LOCAL_* is not needed.
#
# The script plays the owner's part in the cap story: once the second subtask is out, it lowers
# the enforced window it put on the main key, so the key is past its threshold and the next new
# intern goes to the local provider. A model that answers in well under a second can delegate
# part three first; the checks at the end then say so. The script exits non-zero when one of the
# five exit criteria was not seen.
#
# Settings, all overridable: TBN_URL, ANTHROPIC_BASE_URL, ANTHROPIC_CHEAP_MODEL, LOCAL_API_KEY,
# TBN_INTERN_TTL_MINUTES (1), TBN_TIMEOUT_SECONDS (900). The owner's idle timeout goes back to its
# old value when the script ends. The report lands in ./demo_reports/. Needs curl and jq.
set -euo pipefail

url=${TBN_URL:-http://127.0.0.1:3000}
username=${TBN_USERNAME:?set TBN_USERNAME}
password=${TBN_PASSWORD:?set TBN_PASSWORD}
main_key=${ANTHROPIC_API_KEY:?set ANTHROPIC_API_KEY}
main_base=${ANTHROPIC_BASE_URL:-https://api.anthropic.com}
main_model=${ANTHROPIC_MODEL:?set ANTHROPIC_MODEL}
main_cheap=${ANTHROPIC_CHEAP_MODEL:-$main_model}
ttl_minutes=${TBN_INTERN_TTL_MINUTES:-1}
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

past_deadline() {
  ((SECONDS >= deadline))
}

echo "Logging in as $username"
token=$(curl -fsS -X POST "$url/auth/login" -H 'Content-Type: application/json' \
  --data "$(jq -cn --arg u "$username" --arg p "$password" '{username: $u, password: $p}')" | jq -r .token)

old_ttl=$(api GET /preferences | jq -r .intern_idle_ttl_minutes)
restore_ttl() {
  api PUT /preferences/intern_idle_ttl_minutes "$(jq -cn --argjson v "$old_ttl" '{value: $v}')" >/dev/null ||
    echo "Could not restore the idle timeout to $old_ttl minutes"
}
trap restore_ttl EXIT
echo "Setting the intern idle timeout to $ttl_minutes minute(s), from $old_ttl"
api PUT /preferences/intern_idle_ttl_minutes "$(jq -cn --argjson v "$ttl_minutes" '{value: $v}')" >/dev/null

echo "Adding the main provider"
main_id=$(api POST /providers "$(jq -cn \
  --arg name "main-$stamp" --arg base "$main_base" --arg key "$main_key" \
  --arg model "$main_model" --arg cheap "$main_cheap" \
  '{name: $name, api_format: "anthropic_messages", base_url: $base, api_key: $key,
    models: ([{model_id: $model, cost_tier: "premium"}, {model_id: $cheap, cost_tier: "cheap"}] | unique_by(.model_id))}')" | jq -r .id)

local_id=$(api GET /providers | jq -r '[.[] | select(.is_local)][0].id // empty')
if [[ -n "$local_id" ]]; then
  echo "Using the local provider $(api GET "/providers/$local_id" | jq -r .name)"
else
  echo "Adding the local provider"
  local_base=${LOCAL_BASE_URL:?set LOCAL_BASE_URL, or add a local provider first}
  local_model=${LOCAL_MODEL:?set LOCAL_MODEL}
  local_id=$(api POST /providers "$(jq -cn \
    --arg name "local-$stamp" --arg base "$local_base" --arg key "${LOCAL_API_KEY:-local}" \
    --arg model "$local_model" \
    '{name: $name, api_format: "openai_chat_completions", base_url: $base, api_key: $key,
      is_local: true, models: [{model_id: $model, cost_tier: "cheap"}]}')" | jq -r .id)
fi

echo "Adding an enforced daily window on the main key, far from its threshold for now"
window_id=$(api POST "/providers/$main_id/cap_windows" "$(jq -cn \
  '{name: "Demo daily", length_count: 1, length_unit: "day", reset_mode: "rolling",
    unit: "requests", limit: 100000, threshold_percent: 100, enforced: true}')" | jq -r .id)

echo "Recruiting a manager"
manager=$(api POST /agents "$(jq -cn --arg name "tea-editor-$stamp" --arg provider "$main_id" \
  --arg model "$main_model" --arg cheap "$main_cheap" \
  '{name: $name, role: "Tea editor", job_description: "Plans short guides, has interns write the parts, and reports to the owner.",
    provider_id: $provider, primary_model: $model, intern_model: $cheap}')")
manager_id=$(jq -r .id <<<"$manager")
department_id=$(jq -r .department_id <<<"$manager")

echo "Assigning one goal"
goal=$(api POST /tasks "$(jq -cn --arg agent "$manager_id" \
  '{title: "Three part tea guide", assignee_agent_id: $agent,
    instructions: "Have your interns write a three part guide to brewing tea, one part at a time, in exactly these steps.\n1. Call list_roster.\n2. Delegate part one, \"Green tea\", to a new intern with new_intern_role \"Researcher\" and new_intern_job_description \"Researches a topic and writes a short page.\" Ask it to write about 120 words and save them as guides/tea/green.md. End your turn and wait for its report.\n3. Delegate part two, \"Black tea\", to that same intern by passing its name as intern_name. Ask for guides/tea/black.md. End your turn and wait for its report.\n4. Delegate part three, \"Herbal tea\", to a new intern with new_intern_role \"Writer\" and new_intern_job_description \"Writes short pages.\" Ask for guides/tea/herbal.md. End your turn and wait for its report.\n5. Call finish_task with a short report of the guide."}')" | jq -r .id)

echo "Watching the team (up to $timeout_seconds seconds)"
deadline=$((SECONDS + timeout_seconds))
seen=0
lowered=no
while :; do
  subtasks=$(api GET "/tasks?parent_task_id=$goal")
  count=$(jq length <<<"$subtasks")
  while ((seen < count)); do
    title=$(jq -r --argjson i "$seen" '.[$i].title' <<<"$subtasks")
    assignee=$(jq -r --argjson i "$seen" '.[$i].assignee_agent_id' <<<"$subtasks")
    intern=$(api GET "/agents/$assignee")
    key=$(api GET "/providers/$(jq -r .provider_id <<<"$intern")" | jq -r .name)
    earlier=$(jq -r --argjson i "$seen" --arg a "$assignee" \
      '[.[0:$i][] | select(.assignee_agent_id == $a)] | length' <<<"$subtasks")
    how=$([[ "$earlier" -gt 0 ]] && echo "reused" || echo "new")
    echo "  Subtask \"$title\" went to $(jq -r .name <<<"$intern"): $how, on $key with $(jq -r .primary_model <<<"$intern")"
    seen=$((seen + 1))
  done
  if [[ "$lowered" == no && "$count" -ge 2 ]]; then
    # The key passes its threshold: 1% of a limit set 100 requests above what it used so far.
    used=$(api GET "/providers/$main_id/cap_windows" |
      jq --arg id "$window_id" '.[] | select(.id == $id) | .used')
    used_whole="${used%.*}"
    api PATCH "/providers/$main_id/cap_windows/$window_id" \
      "$(jq -cn --argjson limit "$((used_whole + 100))" '{limit: $limit, threshold_percent: 1}')" |
      jq -r '"  The owner lowers the window: \(.used) of \(.limit) \(.unit) used, threshold \(.effective_threshold_percent)%, \(.state)"'
    lowered=yes
  fi
  status=$(api GET "/tasks/$goal" | jq -r .status)
  case "$status" in
    done) echo "The goal is done"; break ;;
    failed | cancelled) echo "The goal ended as $status"; api GET "/tasks/$goal" | jq .; exit 1 ;;
  esac
  if past_deadline; then echo "Timed out waiting for the goal"; exit 1; fi
  sleep 1
done

echo "Subtasks:"
api GET "/tasks?parent_task_id=$goal" | jq -r '.[] | "  \(.title): \(.status)"'
echo "Interns:"
providers=$(api GET /providers)
api GET "/agents?department_id=$department_id&level=2" | jq -r --argjson providers "$providers" \
  '($providers | map({key: .id, value: .name}) | from_entries) as $names
   | .[] | "  \(.name), \(.role), on \($names[.provider_id]) with \(.primary_model)"'

mkdir -p demo_reports
report=$(api GET "/tasks/$goal" | jq -r .report_id)
api GET "/reports/$report/download" >"demo_reports/$goal.md"
echo "The condensed report, also in demo_reports/$goal.md:"
cat "demo_reports/$goal.md"

echo "Waiting for the idle interns to be terminated after $ttl_minutes minute(s)"
ttl_whole="${ttl_minutes%.*}"
deadline=$((SECONDS + ttl_whole * 60 + 300))
while :; do
  interns=$(api GET "/agents?department_id=$department_id&level=2")
  if jq -e 'all(.[]; .status == "terminated")' <<<"$interns" >/dev/null || past_deadline; then
    jq -r '.[] | "  \(.name): \(.status)"' <<<"$interns"
    break
  fi
  sleep 5
done
echo "Usage on the main key:"
api GET "/providers/$main_id/usage" | jq '{requests, input_tokens, output_tokens, cost}'

failed=no
check() {
  if [[ "$2" == true ]]; then echo "  yes  $1"; else echo "  NO   $1"; failed=yes; fi
}
subtasks=$(api GET "/tasks?parent_task_id=$goal")
local_ids=$(api GET /providers | jq -c '[.[] | select(.is_local) | .id]')
echo "Exit criteria:"
check "the manager spawned interns" "$(jq 'length >= 2' <<<"$interns")"
check "it reused an idle intern" \
  "$(jq '[group_by(.assignee_agent_id)[] | length] | max >= 2' <<<"$subtasks")"
check "a new intern went to the local provider past the threshold" \
  "$(jq --argjson ids "$local_ids" 'any(.[]; .provider_id as $p | $ids | index($p) != null)' <<<"$interns")"
check "the idle interns were terminated after the timeout" \
  "$(jq 'all(.[]; .status == "terminated")' <<<"$interns")"
check "one condensed report lists the subtasks" \
  "$(grep -q '^## Subtasks' "demo_reports/$goal.md" && echo true || echo false)"
[[ "$failed" == no ]]
