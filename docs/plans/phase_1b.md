# Phase 1b plan: the team

## Goal

A manager runs a team. It reads the roster, hands subtasks to interns it spawns or reuses inside
its own department, waits for their reports, and returns one condensed report. Cap windows protect
each key, the local provider takes new interns once a key passes its threshold, idle interns are
terminated, and the runaway guard pauses a looping run. The circuit breaker, out-of-credit blocking
and compaction, moved here from 1a, pause and shrink runs the same way.

## Exit criteria

The owner assigns one goal and sees a manager:

1. spawn interns;
2. reuse an idle one;
3. switch new interns to the local provider after a cap threshold;
4. terminate an idle one after the timeout;
5. return one condensed report.

`scripts/demo_phase_1b.sh` runs the story over HTTP against the development stack, with a main
provider and a local one such as Ollama. One Jest test runs the same story against fake providers.

## Design

### Where the code goes

- `RuntimeProvidersModule` gains the local flag, the parallel request limit, the context window per
  model, the breaker and out-of-credit state, and cap windows: their repository and `CapService`,
  which turns usage records into window state. It still reads no preferences, so its callers pass
  the threshold defaults, and it keeps depending on nothing but the database and crypto.
- `CompanyModule` gains interns (spawn, idle tracking, termination, roster view) and task
  delegation, blocking, the approval state and the child queries.
- `KnowledgeModule` gains the new preference keys.
- `RuntimeModule` gains the three agent tools; the pauses, the guard, compaction and condensed
  reports in the loop; paused runs in the wake handler; a worker sweep; and the routes that need
  preferences: cap windows, and continue and stop on runs.
- The dependency direction stays as in 1a.

### Paused runs

A run that cannot go on pauses instead of failing. `runs.status` gains `paused`, with
`pause_reason` and `resume_at`. The agent keeps the run as its active run, so it takes no other
task meanwhile.

| Reason | Task status | Resumes when |
| --- | --- | --- |
| `waiting_on_subtasks` | `in_progress` | a subtask result or a message reaches the agent |
| `cap_limit` | `blocked` | `resume_at`, the reset of the window at its limit |
| `breaker_open` | `blocked` | `resume_at`, the end of the breaker's cooldown |
| `out_of_credit` | `blocked` | the owner changes the key or calls `POST /providers/:id/resume` |
| `runaway_guard` | `awaiting_approval` | the owner calls `POST /runs/:id/continue` |

- Before every model call the loop checks, in order: the runaway guard, the key's out-of-credit
  state, the breaker, and the enforced cap windows at their limit. Any of them pauses the run.
- A blocked or waiting task carries `status_reason` in plain words, for example "Cap window Daily
  on main reached its limit. Resumes at 2026-10-03T00:00:00Z."
- A delayed `agent_wake` at `resume_at` resumes the time-based pauses. The worker's recovery sweep,
  every `RUN_LEASE_SECONDS / 2`, is the safety net for every reason.
- No lost wake-ups: the update that pauses a run also drops its lease. The loop then looks for
  entries that arrived meanwhile and resumes the run itself if it finds one. A wake that delivers an
  entry after that check finds the run paused with no lease and resumes it.

### Interns and delegation

- `delegate_task` is a manager tool. Its input is a title, instructions, and either `intern_name`,
  an idle intern of the manager's own department, or `new_intern_role` and
  `new_intern_job_description` for a new one.
- The subtask has the manager as delegator and the manager's current task as parent. A manager in a
  run without a task, such as one answering a message, delegates without a parent.
- Reuse before spawn. The manager reads `list_roster` and names an idle intern whose role fits; the
  tool description tells it to. When it asks for a new intern and an idle intern with the same role,
  ignoring case, exists in its department, the runtime hands the subtask to that intern and says so.
  Idle means no active run and no open task.
- A manager can never use another department's intern. The tool refuses one by name, and spawns
  always land in the manager's own department.
- A new intern is a level 2 agent in the manager's department, named `<manager name> intern <n>`,
  with the role and job description the manager wrote and the manager's tool policy. It runs on the
  manager's key with the manager's intern model, or on the local provider (see cap windows).
- Interns cannot delegate: the tool is not offered to level 2 agents and refuses them if called.
- Optional limits, unset by default: `max_interns_per_manager` and `max_live_agents`. A spawn past
  either is refused, and the manager reuses an intern or does the work itself.
- A manager whose task has open subtasks and ends its turn waits (`waiting_on_subtasks`) instead of
  being nudged, and `finish_task` is refused while subtasks are open.
- When a subtask ends, whether done, failed or cancelled, the delegator's transcript gets a
  `subtask_result` entry with the intern's report and the delegator is woken. A per-agent
  `dedupe_key` on transcript entries keeps delivery to one entry when two wakes race.
- Cancelling a task cancels its open subtasks.
- Idle termination: the worker sweep terminates an intern that has been idle for longer than
  `intern_idle_ttl_minutes`, and an idle intern whose manager was dismissed. `agents.status` gains
  `terminated`, and `agents.idle_since` records when the agent last went idle. Managers are never
  terminated automatically.

### Messages and the roster

- `list_roster` returns every live agent: name, level, department, role, job description, status,
  current task with its status, and the key it runs on, with the local provider marked.
- `send_message` takes a recipient's name, a kind (`handoff`, `question` or `finding`) and text. A
  manager may message every manager and the interns of its own department. An intern may message its
  manager and the interns of its department.
- The message becomes an `agent_message` entry in the recipient's transcript and wakes it. A working
  recipient reads it at its next turn, and an idle one starts a run to answer it, as with the owner's
  messages.
- When a user turn holds both tool results and other text, the tool results go first. Both APIs
  reject a tool result that does not directly follow its call, and a message can now land between a
  call and its result.

### Cap windows

A window belongs to a provider key. It has a name, a length (a count of hours, days, weeks or
months), a reset mode (rolling, or fixed with an anchor time), a unit (tokens, requests or money), a
limit, a threshold percent, an `enforced` switch and an optional model.

- Usage comes only from `usage_records`. Tokens are input plus output tokens, money is the cost from
  the owner's prices, and requests count calls. A window with a model counts only that model.
- A rolling window covers the last length up to now. A fixed window steps from its anchor in whole
  lengths, in UTC; a monthly step keeps the anchor's day and clamps it to the month's last day.
- A window without its own threshold uses `cap_threshold_longest_percent` (75) when it is the
  longest window of its key and `cap_threshold_shorter_percent` (85) otherwise.
- A new key gets three example windows: Monthly, Weekly and Daily, rolling, in tokens, with
  placeholder limits and enforcement off. They show usage at once and block nothing until the owner
  sets real limits and turns enforcement on.
- `GET /providers/:id/cap_windows` returns each window with its usage, effective threshold, start,
  reset time and state: `ok`, `past_threshold` or `at_limit`.
- Enforcement applies only to enforced windows:
  - Past the threshold, on a window that counts the intern model: the manager hands no new work to
    interns on that key, neither by spawning nor by reuse. New interns go to the local provider, and
    without one `delegate_task` tells the manager to do the subtask itself. Interns already running
    finish on the key they started with.
  - At the limit, on a window that counts the call's model: every run on the key, the manager's and
    its interns', pauses before its next call (`cap_limit`) until the window resets. For a fixed
    window that is the next boundary. For a rolling window it is the moment enough of the oldest
    usage leaves the window to bring it under the limit.
- A window with `enforced` off shows usage and changes nothing.

### Local fallback and the parallel request limit

- `providers.is_local` marks the local provider. Marking one clears the flag on the owner's other
  providers.
- An intern on the local provider uses its first `cheap` model, or its first model. If the local
  provider is past its own threshold, no intern is spawned on it.
- `providers.max_parallel_requests` is optional. The provider client holds a slot per provider for
  each attempt, and further calls wait their turn. Ceiling: the slots live in the worker process, so
  the limit holds per worker process.

### Circuit breaker and out of credit

- A call that still fails after its retries with a rate limit, a server error, a timeout or a
  network error adds one to the provider's `breaker_failures` and pauses its run (`breaker_open`)
  for `PROVIDER_BREAKER_COOLDOWN_SECONDS`. At `PROVIDER_BREAKER_THRESHOLD` consecutive failures the
  breaker opens until `breaker_open_until`, and every run on the provider pauses before calling
  until then. The next call after that is the probe, and a success resets the count. An open
  breaker never fails a run.
- An out-of-credit answer sets the provider's `out_of_credit_since`, moves every queued and
  in-progress task of every agent on that key to `blocked`, and pauses the runs before their next
  call. Changing the key with `PATCH /providers/:id` or calling `POST /providers/:id/resume` clears
  it. The worker sweep then resumes the runs from their checkpoints and returns blocked tasks that
  never started to `queued`.
- Authentication and bad request errors still fail the run, as in 1a.

### Runaway guard

- `runs.guard_turns` counts model turns since the run's task last changed status or the owner last
  said continue. At `runaway_guard_turns` (default 50) the run pauses (`runaway_guard`) and its task
  moves to `awaiting_approval`.
- `POST /runs/:id/continue` resets the count and resumes the run. `POST /runs/:id/stop`, or
  cancelling the task, ends it.
- The guard replaces the 1a hard stop at 100 turns.

### Compaction

- Provider models gain `context_window_tokens`, 128,000 when the owner gives none.
- Before each model call the runtime estimates the request at one token per three characters. Past
  60 percent of the window it summarises the older entries and any earlier summary with the cheaper
  model of the agent's key, and appends a `compaction` entry holding the summary and the last `seq`
  it covers.
- From then on the request carries the latest summary, then the entries after it. The newest
  entries kept fill up to 25 percent of the window, and the cut falls before an assistant turn or a
  message, never between a tool call and its result.
- A tool result longer than a quarter of the window is shortened in the request. The transcript
  keeps it whole.
- The summary call is a model call like any other: counted on the key and checked against the caps.

### Condensed reports

- `finish_task` refuses a level 1 report longer than 2,000 characters across its four fields, so it
  fits on one screen.
- A report on a task with subtasks adds a Subtasks section, one line each with the title, intern,
  status and report id. Its tokens and cost cover the whole tree: the manager's run and every
  subtask's run.
- Each intern keeps its own full report, listed in `GET /reports`.

### What waits for a later phase

- Alerts. The brief sends threshold and out-of-credit alerts through notification channels, which
  arrive in 1c. Until then the alert is the blocked task with its reason, the provider's
  `out_of_credit_since`, the window's state in the caps route, and a warning in the log.
- The runaway guard's question joins the approval inbox in 1c. Until then it is the paused run, its
  task in `awaiting_approval`, and the continue and stop routes.
- The event log and the world's semantic events, such as "intern spawned" and "intern terminated",
  arrive in phase 2. Meanwhile the transcripts and the rows record every call.

## Tasks

1. Contracts, Prisma schema and migration for every change below.
2. Providers: local flag, parallel limit, context window, breaker and out-of-credit state, the resume
   route, cap windows with the example windows on a new key, `CapService` and the window arithmetic.
3. Company: intern spawn, idle tracking and termination, roster view, task delegation, blocking,
   the approval state, child queries, delegator notification, cascading cancel.
4. Runtime: `list_roster`, `send_message` and `delegate_task`; paused runs and the pre-call checks;
   waiting on subtasks and result delivery; the runaway guard; compaction; condensed reports; the
   wake handler and the worker sweep; the cap window and run routes.
5. Tests: everything under "Tests required".
6. `.env.example` and compose additions, `CLAUDE.md`, `docs/architecture.md`, the demo script,
   `docs/reports/phase_1b.md`, the draft pull request.

## Contracts that change

### Tables

| Table | Change |
| --- | --- |
| `providers` | add `is_local` (default false), `max_parallel_requests` null, `breaker_failures` (default 0), `breaker_open_until` null, `out_of_credit_since` null |
| `provider_models` | add `context_window_tokens` (default 128000) |
| `cap_windows` | new: `provider_id`, `model_id` null, `name`, `length_count`, `length_unit` (`hour`, `day`, `week`, `month`), `reset_mode` (`rolling`, `fixed`), `anchor_at` null, `unit` (`tokens`, `requests`, `money`), `limit`, `threshold_percent` null, `enforced` |
| `agents` | `status` gains `terminated`; add `idle_since` |
| `tasks` | add `status_reason` null, `delegator_notified_at` null |
| `runs` | `status` gains `paused`; add `pause_reason` null, `resume_at` null, `guard_turns` (default 0) |
| `transcript_entries` | `kind` gains `agent_message`, `subtask_result`, `compaction`; add `dedupe_key` null, unique per agent |

### Schemas in `@tbn/contracts`

- `ProviderSchema` adds `is_local`, `max_parallel_requests`, `breaker_open_until` and
  `out_of_credit_since`; writes accept `is_local` and `max_parallel_requests`.
  `ProviderModelSchema` adds `context_window_tokens`, optional on writes.
- New `CapWindowSchema`, with `CreateCapWindowSchema`, `UpdateCapWindowSchema` and
  `CapWindowStatusSchema` derived from it.
- `AgentStatusSchema` adds `terminated`, and `AgentListQuerySchema` adds `level`.
- `TaskSchema` adds `status_reason`, and `TaskListQuerySchema` adds `parent_task_id`.
- `RunStatusSchema` adds `paused`, and `RunSchema` adds `pause_reason` and `resume_at`.
- `TranscriptEntrySchema` adds `agent_message`, `subtask_result` and `compaction`.
- `PreferencesSchema` adds the keys below.

### Routes

| Method and path | Purpose |
| --- | --- |
| `GET,POST /providers/:id/cap_windows`, `PATCH,DELETE /providers/:id/cap_windows/:window_id` | Cap windows with their live usage |
| `POST /providers/:id/resume` | The owner topped up: clear out-of-credit and the breaker |
| `POST /runs/:id/continue`, `POST /runs/:id/stop` | The owner's answer to the runaway guard |
| `GET /agents?level=`, `GET /tasks?parent_task_id=` | New filters |

### Preferences

| Key | Default |
| --- | --- |
| `intern_idle_ttl_minutes` | 30 |
| `runaway_guard_turns` | 50 |
| `cap_threshold_longest_percent` | 75 |
| `cap_threshold_shorter_percent` | 85 |
| `max_interns_per_manager` | unset |
| `max_live_agents` | unset |

### Environment

`PROVIDER_BREAKER_THRESHOLD` (3) and `PROVIDER_BREAKER_COOLDOWN_SECONDS` (60), documented in
`.env.example`.

## Tests required

All against a real PostgreSQL with fake providers. The fake provider server gains a responder that
picks each reply from the request, so a manager and its interns can call one server at once.

Required by the roadmap:

- a window with enforcement off never changes behaviour: a display-only window far past its limit,
  and the manager still spawns on its key and every call goes through;
- an enforced window past its threshold stops intern spawns on that key and sends new interns to
  the local provider, and without a local provider the manager is told to do the subtask itself;
- a blocked manager resumes when the window resets: a fixed window anchored a few seconds ahead, the
  manager's task `blocked` at the limit, then `done` after the reset with no model call repeated;
- rolling and fixed windows reset at the right time: the window arithmetic for every length, anchors
  before and after now, month ends, and a rolling reset computed from backdated usage;
- an idle intern is reused before a spawn, both by name and by role;
- a manager cannot use another department's intern;
- an intern is terminated after the idle timeout, and an intern still inside it is not;
- the runaway guard pauses a looping run, continue resumes it and stop ends it.

Also:

- the exit story in one test: spawn, reuse, switch to the local provider past the threshold,
  termination, and one condensed report with the subtask lines and the tree's totals;
- the breaker pauses runs without failing them, opens after the set failures, and lets them resume
  after the cooldown;
- out of credit blocks every task on the key, and changing the key resumes them from their
  checkpoints;
- the parallel limit: two agents on a provider limited to one request never have two calls in
  flight;
- compaction: a small context window produces a `compaction` entry, the next request carries the
  summary instead of the old entries, and no tool result is separated from its call;
- messages: who may message whom, an idle recipient starts a run, a working one reads the message
  at its next turn;
- a manager waits for its subtasks instead of being nudged, `finish_task` is refused while subtasks
  are open, and a level 1 report over the budget is refused;
- cancelling a task cancels its subtasks;
- every new route gets auth, the happy path and a rejection, and every new repository method an
  integration test with owner scoping.

## Where I think the brief is wrong for this phase

1. **The runaway guard and managers.** A manager that waits on its interns keeps its own task in
   progress for the whole goal, so every turn of a long orchestration counts towards the guard. I
   build the rule as written with a default of 50 turns, and if healthy goals trip it, a finished
   subtask could count as progress.
