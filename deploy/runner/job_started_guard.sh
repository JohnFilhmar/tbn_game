#!/usr/bin/env bash
# Job-started hook for the self-hosted runner on the production server. The runner runs it before
# every job, and a non-zero exit fails the job before any step runs. It admits only the deploy
# workflow from main, dispatched by the owner, so pull request code never runs on the server.
# Installed as ACTIONS_RUNNER_HOOK_JOB_STARTED; see docs/server_setup.md.
set -euo pipefail

readonly expected_repository="JohnFilhmar/tbn_game"
readonly expected_actor="JohnFilhmar"
readonly expected_workflow_ref="$expected_repository/.github/workflows/deploy.yml@refs/heads/main"

refuse() {
  echo "Refused by the tbn job guard: $1" >&2
  exit 1
}

[[ "${GITHUB_REPOSITORY:-}" == "$expected_repository" ]] ||
  refuse "repository is '${GITHUB_REPOSITORY:-unset}'"
[[ "${GITHUB_EVENT_NAME:-}" == "workflow_dispatch" ]] ||
  refuse "event is '${GITHUB_EVENT_NAME:-unset}', only workflow_dispatch may run here"
[[ "${GITHUB_REF:-}" == "refs/heads/main" ]] ||
  refuse "ref is '${GITHUB_REF:-unset}', only refs/heads/main may run here"
[[ "${GITHUB_WORKFLOW_REF:-}" == "$expected_workflow_ref" ]] ||
  refuse "workflow is '${GITHUB_WORKFLOW_REF:-unset}'"
[[ "${GITHUB_TRIGGERING_ACTOR:-}" == "$expected_actor" ]] ||
  refuse "triggered by '${GITHUB_TRIGGERING_ACTOR:-unset}'"

echo "tbn job guard: admitted the production deploy dispatched by $expected_actor"
