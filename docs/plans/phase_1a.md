# Phase 1a plan: one agent, one task

## Goal

The company over REST, for one agent at a time: owner login, providers with both adapters and
encrypted keys, managers and departments, instructions, skills and preferences, tasks, durable
checkpointed runs, usage counting per key, prompt caching, the file tools, and reports.

## Exit criteria

Using only HTTP calls, the owner adds two providers, recruits two level 1 agents on different
providers, assigns each a writing task, and downloads both reports. Killing the worker mid-run
loses nothing.

`scripts/demo_phase_1a.sh` runs the whole demo with `curl` against the development stack. The
owner account is created once with a one-off command in the image (see below).

## Design

### Dependency direction

The brief puts tasks and reports in `company/` and the run loop in `runtime/`. A task assignment
must start a run, and a run must update its task and write its report, which would make the two
modules depend on each other. The plan avoids the cycle with the queue:

- `company/` creates the task and sends an `agent_wake` job through `lib/queue`.
- `runtime/` handles the job: it picks the agent's next queued task, runs it, and calls the
  exported `company/` services to move the task along and store the report.
- `runtime/` owns runs and transcripts, so the transcript and message routes under
  `/agents/:id/transcript` and `/agents/:id/messages` live in a `runtime/` controller.
- Cancelling a task or dismissing an agent only changes a status. The loop reads task and agent
  status before every model turn and stops by itself, so `company/` never calls `runtime/`.

Dependencies: `identity/` stands alone; `knowledge/` stands alone; `company/` depends on
`lib/queue`; `runtime/` depends on `company/`, `knowledge/` and `lib/queue`.

### Durable runs

A run is an agent's work on one task, or on one owner message when the agent is idle. The
transcript is the checkpoint: every model turn and every tool result is a row in
`transcript_entries` before the loop continues. A restarted worker rebuilds the request from the
transcript, so nothing is repeated or lost.

- `pg-boss` queue `agent_wake` with `singletonKey = agent_id`. The web process only sends; the
  worker handles.
- The worker takes a lease on the run (`lease_owner`, `lease_expires_at`) and extends it every
  turn. A job for a run whose lease is held by a live worker exits at once.
- On boot and every minute, the worker re-sends a wake for every running run whose lease has
  expired. That is what recovers a run after a kill.
- On SIGTERM the loop finishes the turn in flight, releases the lease, re-sends the wake and
  returns, so the next worker continues.
- An agent runs one task at a time. Tasks queue per agent in creation order.
- The loop ends a task when the model calls `finish_task`. If the model ends its turn without
  calling it, the loop nudges once, then builds the report from the last assistant text.
- A hard cap of 100 turns per run marks the run failed. Phase 1b replaces it with the runaway
  guard.

### Model requests

- Stable prefix first: standing instructions, role instructions, agent instructions, the agent's
  identity, the skill list, then the tool definitions. The conversation comes last.
- Anthropic Messages: `cache_control` on the last system block and the last tool. OpenAI chat
  completions: automatic prefix caching, `cached_tokens` read from the usage block.
- Every call writes a `usage_records` row with input, output, cache read and cache write tokens
  and the cost from the prices the owner entered. `GET /providers/:id/usage` sums them.
- Calls use a timeout and retries with exponential backoff and jitter on rate limits, server
  errors and network errors, honouring `retry-after`. The circuit breaker and the out-of-credit
  rule arrive in phase 1b with the caps, because all three pause runs the same way.

### Secrets

- API keys are encrypted with AES-256-GCM under `SECRETS_ENCRYPTION_KEY`, stored as
  `v1.<iv>.<tag>.<ciphertext>`. The key is decrypted only inside the provider client at call time.
- No response carries a key. Provider responses carry `api_key_set: true`. Request bodies are never
  logged, and the redaction list covers the known header and field names.

### Owner account

The owner is created with a one-off command in the image, which reads the password from stdin:

```
printf '%s' "$PASSWORD" | docker compose -f docker-compose.development.yml run --rm -T web dist/admin.js owner_create john
```

Login returns a session token that expires after `SESSION_TTL_MINUTES`. Sessions are rows, so both
process types validate them. The global guard rejects every route without a valid bearer token
except those marked `@Public()`: `/health`, `/metrics`, `POST /auth/login`.

## Tasks

1. Foundations: Prisma schema and migrations for every table below, plus the pg-boss schema as a
   migration from `getConstructionPlans`; config additions; `lib/crypto`; `lib/queue`;
   `lib/validation` (Zod pipe and decorators); `lib/auth` (`@Public`, `@CurrentOwner`);
   `identity/` (owner, sessions, guard, login, logout, me); `admin.ts` with `owner_create`.
2. `knowledge/`: instructions, skills with `SKILL.md` import and export and attachments to roles
   and agents, preferences with a typed key registry.
3. `runtime/` providers: CRUD with models, encrypted keys, the two adapters behind one interface,
   retries, usage records and the usage endpoint, fake provider servers for tests.
4. `company/`: departments, agents (recruit, edit, dismiss, roster), tasks (create, list, get,
   cancel) that wake the agent, reports (list, get, download).
5. `runtime/` runs: transcripts, tool registry and policy, file tools, `load_skill`,
   `finish_task`, prompt assembly, the loop, worker job handlers, orphan recovery, graceful stop,
   transcript and message routes, run routes.
6. Compose and `.env.example` additions, `CLAUDE.md` and `docs/architecture.md` updates, the demo
   script, `docs/reports/phase_1a.md`, the draft pull request.

## Contracts that change

### Tables

All tables carry `owner_id`, and every repository query is scoped by it. Ids are UUID v7.

| Table | Columns beyond `id`, `owner_id`, `created_at`, `updated_at` |
| --- | --- |
| `owners` | `username` unique, `password_hash` |
| `sessions` | `token_hash` unique, `expires_at`, `last_seen_at` |
| `providers` | `name` unique per owner, `api_format` (`anthropic_messages`, `openai_chat_completions`), `base_url`, `api_key_ciphertext` |
| `provider_models` | `provider_id`, `model_id` unique per provider, `cost_tier` (`cheap`, `standard`, `premium`), `input_price_per_million`, `output_price_per_million`, `cache_read_price_per_million`, `cache_write_price_per_million`, `max_output_tokens` |
| `departments` | `name`, `manager_agent_id` |
| `agents` | `name` unique per owner, `role`, `job_description`, `level`, `department_id`, `provider_id`, `primary_model`, `intern_model`, `appearance` json, `tool_policy` json, `status` (`idle`, `working`, `dismissed`), `active_run_id` |
| `instructions` | `scope` (`global`, `role`, `agent`), `role`, `agent_id`, `title`, `body`, `position`, `enabled` |
| `skills` | `name` unique per owner, `description`, `body` |
| `skill_attachments` | `skill_id`, `target_type` (`role`, `agent`), `role`, `agent_id` |
| `preferences` | `key` unique per owner, `value` json |
| `tasks` | `title`, `instructions`, `assignee_agent_id`, `delegator_agent_id` (null means the owner), `parent_task_id`, `status`, `result`, `report_id`, `started_at`, `finished_at` |
| `runs` | `agent_id`, `task_id` nullable, `status` (`running`, `done`, `failed`, `cancelled`), `turn_count`, `lease_owner`, `lease_expires_at`, `error`, `started_at`, `finished_at` |
| `transcript_entries` | `agent_id`, `run_id` nullable, `seq` unique per agent, `kind` (`owner_message`, `task_assignment`, `assistant`, `tool_result`, `system_note`), `content` json |
| `usage_records` | `provider_id`, `model_id`, `agent_id`, `run_id`, `input_tokens`, `output_tokens`, `cache_read_tokens`, `cache_write_tokens`, `cost` |
| `reports` | `task_id` unique, `agent_id`, `body_md` |

### Schemas in `@tbn/contracts`

One schema per model: `OwnerSchema`, `SessionSchema`, `ProviderSchema`, `ProviderModelSchema`,
`DepartmentSchema`, `AgentSchema`, `InstructionSchema`, `SkillSchema`, `PreferenceSchema` with the
key registry, `TaskSchema`, `RunSchema`, `TranscriptEntrySchema`, `UsageSummarySchema`,
`ReportSchema`. Inbound shapes derive from them with `pick`, `omit` and `partial`. The one
addition is `api_key` on provider writes, because the model schema never carries it.

### Routes

Every route except `/health`, `/metrics` and `POST /auth/login` needs `Authorization: Bearer`.

| Method and path | Purpose |
| --- | --- |
| `POST /auth/login`, `POST /auth/logout`, `GET /auth/me` | Session |
| `GET,POST /providers`, `GET,PATCH,DELETE /providers/:id`, `GET /providers/:id/usage` | Providers; models are written with the provider |
| `GET,POST /instructions`, `GET,PATCH,DELETE /instructions/:id` | Instructions |
| `GET,POST /skills`, `GET,PATCH,DELETE /skills/:id`, `POST /skills/import`, `GET /skills/:id/export`, `PUT /skills/:id/attachments` | Skills |
| `GET /preferences`, `PUT /preferences/:key` | Preferences |
| `GET /departments` | Departments |
| `GET,POST /agents`, `GET,PATCH /agents/:id`, `POST /agents/:id/dismiss` | Agents |
| `GET /agents/:id/transcript`, `POST /agents/:id/messages` | Transcript and owner messages |
| `GET,POST /tasks`, `GET /tasks/:id`, `POST /tasks/:id/cancel` | Tasks |
| `GET /runs`, `GET /runs/:id` | Runs |
| `GET /reports`, `GET /reports/:id`, `GET /reports/:id/download` | Reports |

### Environment

New variables, all documented in `.env.example`: `SECRETS_ENCRYPTION_KEY` (required),
`SESSION_TTL_MINUTES`, `WORKER_CONCURRENCY`, `WORKSPACE_DIR`, `PROVIDER_TIMEOUT_MS`,
`PROVIDER_MAX_ATTEMPTS`, `RUN_LEASE_SECONDS`.

### Image

`dist/admin.js` joins `dist/web.js`, `dist/worker.js` and `dist/healthcheck.js`.

## Tests required

All against a real PostgreSQL. Model providers are faked by in-test HTTP servers that speak the
Anthropic Messages and OpenAI chat completions formats, so the real adapters, retries and usage
accounting run in every test.

- Every new repository method gets an integration test, including owner scoping: a row of one
  owner is invisible to another.
- Every endpoint gets a supertest test for auth (401 without a token), the happy path, and one
  rejection (an unknown field, a bad value or a missing row).
- Required by the brief:
  - a worker killed mid-run resumes from its checkpoint: the real worker process is started from
    `dist/worker.js`, killed with SIGKILL while a model call is in flight, started again, and the
    task finishes with one report, no duplicated transcript entry and one file written;
  - a saved API key never appears in a response or a log: every provider route is called with a
    known key while pino writes to a buffer, and neither the responses nor the buffer contain it.
- Runtime: a run on an Anthropic provider and a run on an OpenAI provider both finish with a
  report; usage is recorded per provider with cached tokens; a `deny` tool is not offered; a tool
  with policy `ask` answers the model with an error; a path outside the workspace is refused; an
  owner message to an idle agent starts a run and the answer lands in the transcript; a message to
  a working agent is read at the next turn; a cancelled task stops its run; SIGTERM during a run
  releases the lease and the run resumes on the next worker.
- Adapters: each adapter maps system, messages, tools and tool results correctly, retries on 429
  with `retry-after`, gives up after `PROVIDER_MAX_ATTEMPTS`, and maps auth errors to a
  non-retryable error.
- Crypto: round trip, a tampered ciphertext is rejected, a wrong key is rejected.
- Auth: login with a wrong password is 401 with no hint, an expired session is 401, logout
  invalidates the token, argon2 hashes verify.
- Skills: import parses frontmatter, export round-trips, a body without frontmatter is rejected.

## Where I think the brief is wrong for this phase

1. **Approval inbox.** The brief lists `ask` as a tool policy from the start, but the approval
   inbox is phase 1c. In 1a a call to an `ask` tool answers the model with an error that says
   approval is not available yet, so the policy value is accepted and stored now and starts to
   pause runs in 1c.
2. **Breaker and out-of-credit.** The brief puts the circuit breaker and the out-of-credit rule
   under LLM connections, which 1a builds. Both pause runs exactly as a cap at its limit does, so
   I build the three together in 1b and keep 1a to timeout and retries.
3. **Compaction.** The brief wants long sessions compacted into a summary plus recent turns. One
   writing task per agent stays far below any context window, so compaction waits for 1b, where
   managers run many tasks in one session.
4. **Owner creation over HTTP.** The exit criteria say "using only HTTP calls", but an endpoint
   that creates the only account would have to be public. The owner is created with a one-off
   command in the image, like running migrations, and everything after that is HTTP.
5. **Event log and idempotent commands.** The brief wants every state change in the event log and
   every command idempotent on a client id. The roadmap puts both in phase 2, so 1a commands carry
   no client id yet and phase 2 adds the log and the id to every command built here.
