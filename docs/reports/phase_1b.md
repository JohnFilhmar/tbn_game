# Phase 1b report: the team

## Outcome

Phase 1b meets its exit criteria. The owner assigns one goal and sees a manager spawn interns,
reuse an idle one, switch new interns to the local provider after a cap threshold, terminate idle
interns after the timeout, and return one condensed report.

- **On the development stack.** `scripts/demo_phase_1b.sh` runs the story over HTTP and checks
  each of the five criteria at the end. I ran it against the rebuilt stack with a fake model
  server that plays the manager and its interns in both API formats and answers in 1.5 seconds.
  - The manager read the roster, spawned `intern 1` on the main key for "Green tea", and reused
    it by name for "Black tea".
  - The script then lowered the enforced window on the main key, as an owner would, and the next
    new intern, `intern 2`, went to the local provider with its model.
  - The goal finished with one report of 739 characters. It lists the three subtasks with their
    interns and report ids, and its usage covers the whole tree: 14 requests, of which 12 were on
    the main key.
  - Both interns were terminated within two minutes of going idle, and every check printed
    "yes".
- **In Jest.** `team.spec.ts` runs the same story against fake providers, with a real worker and
  a real database, and checks the subtasks, the interns' keys and models, the report and the
  terminations.
- **Required tests.** Each one the roadmap lists exists and passes:

  | Required test | Where |
  | --- | --- |
  | A window with enforcement off never changes behaviour | `pauses.spec.ts`, `delegate_task.tool.spec.ts`, `cap.service.spec.ts` |
  | An enforced window past its threshold stops intern spawns on that key and sends new interns to the local provider | `delegate_task.tool.spec.ts`, `team.spec.ts` |
  | A blocked manager resumes when the window resets | `pauses.spec.ts` |
  | Rolling and fixed windows reset at the right time | `window_math.spec.ts`, `cap.service.spec.ts` |
  | An idle intern is reused before a spawn | `delegate_task.tool.spec.ts`, `team.spec.ts` |
  | A manager cannot use another department's intern | `delegate_task.tool.spec.ts` |
  | An intern is terminated after the idle timeout | `worker_sweep.service.spec.ts`, `team.spec.ts` |
  | The runaway guard pauses a looping run | `pauses.spec.ts` |

- **CI is green on the draft pull request**,
  [JohnFilhmar/tbn_game#5](https://github.com/JohnFilhmar/tbn_game/pull/5), with every gate on the
  first run. In [run 37006694502](https://github.com/JohnFilhmar/tbn_game/actions/runs/37006694502)
  the image job pushed
  `ghcr.io/johnfilhmar/tbn_game/backend@sha256:e6d179de385855ad45910915e128a9ed777d2506b976c24b83b3e821937db14b`,
  signed it with cosign under the pull request identity and attested its SBOM.

## Demo

With Docker and the compose plugin, from the repository root:

```
docker compose -f docker-compose.development.yml up --build --wait
docker compose -f docker-compose.development.yml run --rm --no-deps web \
  /app/node_modules/prisma/build/index.js migrate deploy
TBN_USERNAME=john TBN_PASSWORD="$PASSWORD" \
  ANTHROPIC_API_KEY=sk-ant-... ANTHROPIC_MODEL=claude-sonnet-4-5 \
  ANTHROPIC_CHEAP_MODEL=claude-haiku-4-5 \
  LOCAL_BASE_URL=http://<host reachable from the worker>:11434/v1 LOCAL_MODEL=qwen3:8b \
  scripts/demo_phase_1b.sh
```

The owner account from phase 1a still works; create one with `owner_create` on a fresh database.
The script sets the intern idle timeout to one minute and puts it back when it ends. It adds the
main provider, adds the local provider unless you already have one, puts an enforced daily window
on the main key, recruits a manager, and assigns one goal in five explicit steps. It prints each
subtask as it is delegated, lowers the window once the second subtask is out, prints the report,
waits for the terminations and ends with the five checks. The report lands in `demo_reports/`.

`LOCAL_BASE_URL` must be reachable from inside the worker container. On Linux that is usually the
Docker bridge address of the host, for example `http://172.17.0.1:11434/v1`, with Ollama listening
on that address.

## What was done

- **Providers and caps.** The local flag, one per owner. An optional parallel request limit,
  held per attempt in the provider client. A context window per model. Each key's runtime state:
  a circuit breaker counted from calls that fail after their retries, and an out-of-credit mark
  cleared by a new key or `POST /providers/:id/resume`. Cap windows per key in tokens, requests or
  money, rolling or fixed from an anchor in UTC with calendar months, with `CapService` turning
  usage records into each window's state. New keys get three example windows that show usage and
  enforce nothing.
- **Company.** Interns: spawned in the manager's department and named after it, idle tracking,
  reuse by role or by name, optional limits on interns and live agents, termination after the idle
  timeout or when the manager left. Delegated tasks with a parent and a delegator, blocking,
  `awaiting_approval`, requeue of blocked tasks that never started, and cascading cancel. The
  roster with the task each agent holds.
- **Runtime.** Three tools: `list_roster`, `send_message`, and `delegate_task` for managers. A
  manager waits for its subtasks instead of being nudged, cannot finish while one is open, and
  writes a report of at most 2,000 characters that gains a Subtasks section and the usage of the
  whole tree. Runs pause instead of failing: waiting for subtasks, behind a cap window at its limit,
  behind an open breaker, on a key out of credit, or after the runaway guard. Compaction folds a
  long session into a summary written by the key's intern model. The worker's sweep resumes paused
  runs, requeues tasks, delivers subtask results and terminates idle interns.
- **Routes.** `GET`, `POST`, `PATCH` and `DELETE /providers/:id/cap_windows`,
  `POST /providers/:id/resume`, `POST /runs/:id/continue` and `POST /runs/:id/stop`, a `level`
  filter on `GET /agents` and a `parent_task_id` filter on `GET /tasks`. Every one sits behind the
  guard.
- **Tests.** 188 Jest tests in 45 files against a real PostgreSQL, 89 of them new in this phase.
  Every new repository method has an integration test, and every new route a supertest test for
  auth, the happy path and a rejection. `testing/team_harness.ts` runs flows across agents with a
  real worker, and the fake provider server gained a responder that answers from the request.
- **Compose and environment.** `PROVIDER_BREAKER_THRESHOLD` and
  `PROVIDER_BREAKER_COOLDOWN_SECONDS` in both compose files and `.env.example`.
- **Docs.** `CLAUDE.md` for the demo command, paused runs and the test rules;
  `docs/architecture.md` with the phase 1b state, three new ceilings and the decisions; the roadmap
  status; this report.

## What was decided

The decisions table in `docs/architecture.md` has the full list. These came up while building
and verifying the phase:

- **pg-boss waited 30 seconds for a delayed wake.** With LISTEN/NOTIFY on, pg-boss polls a queue
  every 30 seconds, and a delayed job sends no NOTIFY when it comes due. A cap reset or a breaker
  cooldown therefore resumed its run up to 30 seconds late. The worker now polls every 2 seconds
  with NOTIFY on too.
- **A run could be driven twice by one worker.** Since phase 1a, the process holding a run's lease
  could take it again. Two wakes for the same agent handled at once in one worker both drove its
  run: in one test run the second handler failed on the unique index of reports. Phase 1b makes
  such wakes common, because messages, subtask results and the sweep all send them. Nobody takes a
  live lease now, its holder included.
- **Two wakes of one agent raced in one worker.** Found by repeating the runtime suite with the
  worker's logs on, after one test timed out now and then. One handler created a run for the
  agent's next task while a second handler, holding an older read of the agent, took that run for a
  leftover and cancelled it. The task then stayed in progress with no run. Each wake now carries its
  agent as the pg-boss group and the worker handles one wake per agent at a time, which removes
  this class of race in a worker. A leftover run is also cancelled only once it is older than a
  lease, which covers several worker processes. A queue test fails without the limit and passes
  with it.
- **Wakes piled up.** A wake due now is skipped while another due wake for the agent is still
  queued, since that one will see the change.
- **Test files leaked work into later ones.** The sweep reaches every owner, so it woke agents an
  earlier test file left behind. Their runs called fake providers that were gone and cycled through
  breaker pauses, filling the worker's slots. A test file that starts a worker now dismisses the
  agents earlier files left and marks their results delivered.
- **The compaction summary skipped the caps.** The gate checked the manager's primary model only,
  so a window that counts the intern model could not stop the summary call. It now pauses the run
  like any other call the caps stop.
- **The run loop grew to 470 lines.** It is split into the loop, its turns, the gate that decides
  and applies pauses, the lease heartbeat, task completion, subtask delivery and compaction.
- **The objection in the plan.** The runaway guard counts every model turn of a manager's
  orchestration, so a manager with many subtasks reaches it sooner. It is built as the brief says,
  with a default of 50 turns.

## How it was verified

| Check | Here | CI |
| --- | --- | --- |
| Format, lint, typecheck, build | yes | yes |
| 188 Jest tests against PostgreSQL 18 | yes | yes |
| Runtime suite repeated to look for intermittent failures | yes, one found and fixed | no |
| Rebuilt image: release step, smoke test | yes | yes, smoke test |
| Demo script end to end on the stack against a fake model server, five checks passed | yes | no |
| Demo key absent from the web and worker logs | yes | no |
| shellcheck on the scripts | yes, through its container image | yes |
| gitleaks, `npm audit` | yes | yes |
| Semgrep | yes, the public rules repository: it caught two unquoted expansions in the demo script | yes, registry rules |
| Demo against a real model and a real local provider | no, no keys or Ollama here | no |

## Open questions and notes

- **Real providers.** Everything ran against fake servers that follow the two API formats. The
  first run against real endpoints is yours, with the demo script. A real manager follows the
  goal's steps on its own, so it may take a different path, for example by asking for a new
  Researcher instead of naming the first intern. The tool then reuses the idle intern of that role
  anyway, and the checks at the end say what happened.
- **The demo plays the owner's part.** It lowers the window on the main key once the second subtask
  is out. A model that finishes a subtask in well under a second could delegate the third part
  before that, and the local check would then say "NO".
- **Alerts.** Threshold and out-of-credit alerts need the notification channels of phase 1c. Until
  then the signals are the blocked task with its reason, the provider's `out_of_credit_since`, the
  window's state in the caps route, and a warning in the worker log.
- **The approval inbox.** A run stopped by the runaway guard waits for `POST /runs/:id/continue` or
  `/stop`. In phase 1c the question joins the approval inbox.
- **Leftover windows.** The demo leaves its window on the demo key it created, so each run's
  numbers stay visible in the caps route.
- **Next.** Phase 1c needs your approval of the sandbox and proxy design before any code, as the
  roadmap says. It starts when you name it.
