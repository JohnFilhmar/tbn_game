#!/usr/bin/env bash
# The phase 1c demo over HTTP: a manager researches a topic on the open web, has an intern build
# and test a note in the sandbox on a feature branch, reviews and merges it, opens a merge request
# the owner merges, files a ticket through an integration that waits for the owner's approval,
# and reports; then the worker is killed and the owner is notified of the restart. Run it against
# the development stack:
#
#   scripts/stack_up.sh
#   printf '%s' "$PASSWORD" | docker compose -f docker-compose.development.yml run --rm -T web \
#     dist/admin.js owner_create john
#   TBN_USERNAME=john TBN_PASSWORD="$PASSWORD" ANTHROPIC_API_KEY=... ANTHROPIC_MODEL=... \
#     scripts/demo_phase_1c.sh
#
# Search uses the stack's SearXNG, seeded when the owner was created, unless BRAVE_API_KEY is set,
# which adds Brave Search ahead of it. The integration and the notification channel post to
# TBN_WEBHOOK_URL (https://httpbin.org/post by default), so the owner can see the calls land.
# Killing the worker needs the docker CLI on this machine; set TBN_SKIP_KILL=1 to leave it out.
#
# Settings, all overridable: TBN_URL, ANTHROPIC_BASE_URL, ANTHROPIC_CHEAP_MODEL,
# TBN_TIMEOUT_SECONDS (1200), TBN_TOPIC (pelicans). The report lands in ./demo_reports/. Needs
# curl, jq and git.
set -euo pipefail

url=${TBN_URL:-http://127.0.0.1:3000}
username=${TBN_USERNAME:?set TBN_USERNAME}
password=${TBN_PASSWORD:?set TBN_PASSWORD}
main_key=${ANTHROPIC_API_KEY:?set ANTHROPIC_API_KEY}
main_base=${ANTHROPIC_BASE_URL:-https://api.anthropic.com}
main_model=${ANTHROPIC_MODEL:?set ANTHROPIC_MODEL}
main_cheap=${ANTHROPIC_CHEAP_MODEL:-$main_model}
webhook_url=${TBN_WEBHOOK_URL:-https://httpbin.org/post}
timeout_seconds=${TBN_TIMEOUT_SECONDS:-1200}
topic=${TBN_TOPIC:-pelicans}
compose=(docker compose -f docker-compose.development.yml)
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

echo "Adding the main provider"
main_id=$(api POST /providers "$(jq -cn \
  --arg name "main-$stamp" --arg base "$main_base" --arg key "$main_key" \
  --arg model "$main_model" --arg cheap "$main_cheap" \
  '{name: $name, api_format: "anthropic_messages", base_url: $base, api_key: $key,
    models: ([{model_id: $model, cost_tier: "premium"}, {model_id: $cheap, cost_tier: "cheap"}] | unique_by(.model_id))}')" | jq -r .id)

if [[ -n "${BRAVE_API_KEY:-}" ]]; then
  echo "Adding Brave Search ahead of SearXNG"
  api POST /search_providers "$(jq -cn --arg name "brave-$stamp" --arg key "$BRAVE_API_KEY" \
    '{type: "brave", name: $name, base_url: "https://api.search.brave.com", api_key: $key, priority: 1}')" >/dev/null
fi
echo "Search providers, in order:"
api GET /search_providers | jq -r '.[] | "  \(.priority) \(.name) (\(.type))"'

echo "Registering the repository"
repository_id=$(api POST /repositories "$(jq -cn --arg name "notes-$stamp" '{name: $name}')" | jq -r .id)

echo "Adding the ticket integration and a channel for process_restarted, both posting to $webhook_url"
integration_id=$(api POST /integrations "$(jq -cn --arg name "ticket-desk-$stamp" --arg url "$webhook_url" \
  '{name: $name, method: "POST", url: $url, body_format: "json",
    body_template: "{\"summary\": \"{{summary}}\", \"body\": \"{{body}}\"}",
    placeholders: [{name: "summary", description: "One line about the ticket", required: true},
                   {name: "body", description: "The notification body", required: false}]}')" | jq -r .id)
api POST /notification_channels "$(jq -cn --arg id "$integration_id" \
  '{event_type: "process_restarted", integration_id: $id,
    body_template: "{{title}}: {{message}}"}')" >/dev/null

echo "Recruiting a manager"
manager=$(api POST /agents "$(jq -cn --arg name "researcher-$stamp" --arg provider "$main_id" \
  --arg model "$main_model" --arg cheap "$main_cheap" \
  '{name: $name, role: "Research lead", job_description: "Researches topics on the web, has interns write notes into the repository, and files tickets.",
    provider_id: $provider, primary_model: $model, intern_model: $cheap}')")
manager_id=$(jq -r .id <<<"$manager")
api POST "/agents/$manager_id/integrations/$integration_id" >/dev/null

echo "Assigning the goal"
goal=$(api POST /tasks "$(jq -cn --arg agent "$manager_id" --arg repo "$repository_id" --arg topic "$topic" \
  '{title: ("Research " + $topic + " and add a note"), assignee_agent_id: $agent, repository_id: $repo,
    instructions: ("Work in exactly these steps.\n1. Call search_library for \"" + $topic + "\", then web_search for \"" + $topic + " facts\", then fetch_url on the most useful result.\n2. Call git_checkout to prepare your branch of the repository.\n3. Delegate one subtask, \"Add the " + $topic + " note\", to a new intern with new_intern_role \"Developer\" and new_intern_job_description \"Writes short notes into the repository.\" Tell it the three most interesting facts you found and ask it to call git_checkout, write them to notes/" + $topic + ".md with run_command (create the notes directory, git add and git commit in its checkout, cwd is the repository name), call git_publish, and finish. End your turn and wait for its report.\n4. Call git_checkout with branch set to the intern branch named in the delegation result, run_command \"test -s notes/" + $topic + ".md && echo TESTS_PASS\" with cwd set to the repository name, then review_branch with verdict approve and the job id from that output, then merge_feature_branch, then git_checkout again.\n5. Call open_merge_request with notes about the research, passing the same test job id.\n6. Call call_ticket_desk with a one-line summary.\n7. Call finish_task with a short report of what you learned and what was merged.")}')" | jq -r .id)

echo "Watching the manager (up to $timeout_seconds seconds)"
deadline=$((SECONDS + timeout_seconds))
approved=no
seen=0
while :; do
  subtasks=$(api GET "/tasks?parent_task_id=$goal")
  count=$(jq length <<<"$subtasks")
  while ((seen < count)); do
    echo "  Subtask \"$(jq -r --argjson i "$seen" '.[$i].title' <<<"$subtasks")\" on branch $(jq -r --argjson i "$seen" '.[$i].feature_branch' <<<"$subtasks")"
    seen=$((seen + 1))
  done
  pending=$(api GET "/approvals?status=pending&agent_id=$manager_id")
  if [[ "$(jq length <<<"$pending")" -gt 0 ]]; then
    approval=$(jq -c '.[0]' <<<"$pending")
    echo "  The inbox has a request: $(jq -r .tool_name <<<"$approval") with $(jq -c .payload <<<"$approval")"
    echo "  It read: $(jq -r '[.sources[] | "\(.kind) \(.reference)\(if .cached then " (cached)" else "" end)"] | join(", ")' <<<"$approval")"
    echo "  The owner approves it"
    api POST "/approvals/$(jq -r .id <<<"$approval")/approve" '{"note": "Approved by the demo"}' >/dev/null
    approved=yes
  fi
  status=$(api GET "/tasks/$goal" | jq -r .status)
  case "$status" in
    done) echo "The goal is done"; break ;;
    failed | cancelled) echo "The goal ended as $status"; api GET "/tasks/$goal" | jq .; exit 1 ;;
  esac
  if past_deadline; then echo "Timed out waiting for the goal"; exit 1; fi
  sleep 2
done

echo "What the run read:"
run_id=$(api GET "/runs?agent_id=$manager_id" | jq -r '.[0].id')
api GET "/runs/$run_id/sources" | jq -r '.[] | "  \(.kind) \(.reference)\(if .cached then " (cached)" else "" end)"'
echo "Cache statistics:"
api GET /caches/stats | jq -c .

echo "Merge requests:"
api GET "/merge_requests?repository_id=$repository_id" | jq -r '.[] | "  \(.id) \(.source_branch) -> \(.target_branch): \(.status)"'
merge_request=$(api GET "/merge_requests?repository_id=$repository_id&status=open" | jq -r '.[0].id // empty')
merged=no
if [[ -n "$merge_request" ]]; then
  echo "The owner merges $merge_request into development"
  api POST "/merge_requests/$merge_request/merge" | jq -r '"  merged as \(.merge_sha)"'
  merged=yes
fi

mkdir -p demo_reports
report=$(api GET "/tasks/$goal" | jq -r .report_id)
api GET "/reports/$report/download" >"demo_reports/$goal.md"
echo "The report, also in demo_reports/$goal.md:"
cat "demo_reports/$goal.md"

restarted=skipped
if [[ "${TBN_SKIP_KILL:-}" != 1 ]]; then
  echo "Killing the worker with SIGKILL; compose restarts it"
  before=$(api GET "/notifications?event_type=process_restarted" | jq length)
  "${compose[@]}" kill -s SIGKILL worker
  deadline=$((SECONDS + 120))
  restarted=no
  while :; do
    after=$(api GET "/notifications?event_type=process_restarted" | jq length)
    if ((after > before)); then
      api GET "/notifications?event_type=process_restarted" | jq -r '.[0] | "  \(.title): \(.status), attempts \(.attempts)"'
      restarted=yes
      break
    fi
    if past_deadline; then echo "  No restart notification within two minutes"; break; fi
    sleep 3
  done
fi

failed=no
check() {
  if [[ "$2" == true ]]; then echo "  yes  $1"; else echo "  NO   $1"; failed=yes; fi
}
sources=$(api GET "/runs/$run_id/sources")
echo "Exit criteria:"
check "the manager searched the web and read a page" \
  "$(jq 'any(.[]; .kind == "search") and any(.[]; .kind == "fetch")' <<<"$sources")"
check "an intern built on a feature branch in the sandbox" \
  "$(jq 'any(.[]; .feature_branch != null and .status == "done")' <<<"$subtasks")"
check "a merge request to development was opened and the owner merged it" "$([[ "$merged" == yes ]] && echo true || echo false)"
check "an integration call waited for the owner's approval" "$([[ "$approved" == yes ]] && echo true || echo false)"
check "the killed worker sent a restart notification" "$([[ "$restarted" == yes || "$restarted" == skipped ]] && echo true || echo false)"
check "one report was written" "$([[ -s "demo_reports/$goal.md" ]] && echo true || echo false)"
[[ "$failed" == no ]]
