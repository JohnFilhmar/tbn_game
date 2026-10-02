# Phase 1a report: one agent, one task

## Outcome

Phase 1a meets its exit criteria.

- **Using only HTTP calls, the owner adds two providers, recruits two level 1 agents on different
  providers, assigns each a writing task, and downloads both reports.** `scripts/demo_phase_1a.sh`
  does exactly that with `curl` and `jq` against the development stack. I ran it here against a
  fake model server that speaks both API formats: both tasks finished, both reports downloaded,
  and the usage endpoint showed two requests on each key with cached tokens counted. The only step
  outside HTTP is creating the owner account, a one-off command in the image (objection 4 in the
  plan).
- **Killing the worker mid-run loses nothing.** Two proofs:
  - `worker_kill.spec.ts` starts the real worker from `dist/worker.js`, sends SIGKILL while a
    model call is in flight, starts a new worker, and checks that the task finishes with one
    report, no duplicated transcript entry, and that the resumed request equals the interrupted
    one.
  - On the stack, I killed the worker container with SIGKILL while both demo tasks had their first
    model call in flight, started it again, and both tasks finished with a report. The new worker found both runs without
    a live lease 124 seconds after the kill, once the lease had lapsed, and re-sent the interrupted
    calls. Each key ended with two recorded requests: an interrupted call leaves no transcript
    entry and no usage row, so nothing was counted twice.
- **A saved API key never appears in a response or a log.** `provider.controller.spec.ts` calls
  every provider route with a known key while pino writes to a buffer, and checks both. On the
  stack, the demo keys appear nowhere in the web and worker logs.
- **The draft pull request is open**,
  [JohnFilhmar/tbn_game#4](https://github.com/JohnFilhmar/tbn_game/pull/4), with every CI gate. The
  CI result is recorded below once the run finishes.

## Demo

With Docker and the compose plugin, from the repository root:

```
docker compose -f docker-compose.development.yml up --build --wait
docker compose -f docker-compose.development.yml run --rm --no-deps web \
  /app/node_modules/prisma/build/index.js migrate deploy
printf '%s' "$PASSWORD" | docker compose -f docker-compose.development.yml run --rm -T web \
  dist/admin.js owner_create john
TBN_USERNAME=john TBN_PASSWORD="$PASSWORD" \
  ANTHROPIC_API_KEY=sk-ant-... ANTHROPIC_MODEL=claude-sonnet-4-5 \
  OPENAI_API_KEY=sk-... OPENAI_MODEL=gpt-4.1 \
  scripts/demo_phase_1a.sh
```

The script logs in, adds the two providers, recruits `ada` on the Anthropic provider and `grace`
on the OpenAI-compatible one, assigns each a writing task, waits, downloads both reports into
`demo_reports/`, and prints the usage on each key. `OPENAI_BASE_URL` can point at Ollama's `/v1`
for a local model, and `ANTHROPIC_CHEAP_MODEL` and `OPENAI_CHEAP_MODEL` set the intern model when
it differs from the primary one.

To watch a run, `GET /agents/:id/transcript` lists every turn, and `POST /agents/:id/messages`
sends the agent a message that it reads at its next turn, or that starts a run when it is idle.

## What was done

- **Foundations.** The Prisma schema for every table of this phase with its migration, and the
  pg-boss schema as a second migration generated from `getConstructionPlans`, so pg-boss never
  migrates on boot. `lib/queue` wraps pg-boss: the web process sends, the worker handles.
  `lib/crypto` seals provider keys with AES-256-GCM under `SECRETS_ENCRYPTION_KEY`. `lib/validation`
  is the Zod pipe with `@ZodBody`, `@ZodParam` and `@ZodQuery`. `lib/auth` has `@Public()` and
  `@CurrentOwner()`. `lib/workspace` resolves agent paths inside the owner's workspace and refuses
  absolute paths, `..` and symlinks that escape.
- **Identity.** One owner account, created with `dist/admin.js owner_create <username>` reading the
  password from stdin and refusing a second owner. argon2id hashes, session tokens stored as
  SHA-256 hashes with `SESSION_TTL_MINUTES`, a global guard, `POST /auth/login`, `POST /auth/logout`
  and `GET /auth/me`. A wrong password and an unknown user get the same 401 after the same hash
  work.
- **Providers.** CRUD with models and prices, the key write-only and `api_key_set` in its place.
  Two adapters behind one interface: Anthropic Messages, which marks the system prompt and the last
  tool with `cache_control`, and OpenAI chat completions, which reads `cached_tokens`. One client
  applies `PROVIDER_TIMEOUT_MS`, retries with backoff and jitter on rate limits, server errors,
  timeouts and network errors up to `PROVIDER_MAX_ATTEMPTS`, honours `retry-after`, maps auth and
  out-of-credit errors to non-retryable errors, and writes a usage row with cost after every call.
  `GET /providers/:id/usage` sums them per key and per model.
- **Company.** Recruiting a level 1 agent creates the department it heads, named after its role.
  Agents are edited, dismissed and listed as the roster. Tasks are created, listed, read and
  cancelled; creating one sends an `agent_wake` job. Reports are one Markdown document per task,
  listed, read and downloaded.
- **Knowledge.** Instructions for every agent, one role or one agent. Skills with a one-line
  description in the prompt and a body behind `load_skill`, imported from and exported as
  `SKILL.md` with frontmatter, attached to roles and agents. Typed preferences with defaults.
- **Runs.** The wake handler resumes the agent's running run, or starts one for its next queued
  task or an unanswered owner message. The loop appends every model turn and every tool result to
  `transcript_entries` before it goes on, so the transcript is the checkpoint and a restarted
  worker rebuilds the request from it. A run carries a lease that the worker extends during model
  calls; runs whose lease lapsed are re-woken on boot and every `RUN_LEASE_SECONDS / 2`. SIGTERM
  releases the lease between turns. Tools: `list_files`, `read_file`, `write_file`, `load_skill`,
  `finish_task`, behind a registry that applies the `auto`, `deny` and `ask` policies. A run that
  forgets `finish_task` is nudged once, then reported from its last message. 100 model turns end
  a run as failed until the runaway guard in 1b.
- **Routes.** Everything in the plan's table, every one behind the guard except `/health`,
  `/metrics` and `POST /auth/login`.
- **Tests.** 99 Jest tests in 26 files against a real PostgreSQL, 79 of them new in this phase.
  Model providers are faked by in-test HTTP servers that speak both formats, so the adapters,
  retries and usage accounting run for real. Every new repository method has an integration test
  including owner scoping, every endpoint a supertest test for auth, the happy path and a
  rejection, plus the two tests the roadmap requires.
- **Compose and environment.** `SECRETS_ENCRYPTION_KEY`, `WORKER_CONCURRENCY`, `WORKSPACE_DIR`
  with a workspace volume for the worker, and the new optional settings in both compose files and
  `.env.example`. The production file refuses to start without the encryption key.
- **Docs.** `CLAUDE.md` for the new commands, layout and conventions; `docs/architecture.md` with
  the phase 1a state and decisions; the roadmap status; this report.

## What was decided

- **The transcript is the checkpoint.** One table holds the conversation and the resume point,
  so a restarted worker needs no separate run state.
- **Leases and orphan recovery by wake.** pg-boss keeps a dead worker's job active for hours, so a
  lease on the run plus a periodic scan resumes it within `RUN_LEASE_SECONDS`. Wakes carry no
  singleton key: under pg-boss's standard policy a key does nothing, and duplicate wakes are cheap
  because the handler is idempotent.
- **`company` sends a wake instead of calling the loop.** This breaks the cycle between tasks and
  runs. `RuntimeProvidersModule` is split from `RuntimeModule` for the same reason.
- **The worker waits for the queue schema.** Found during verification: on a fresh database the
  worker crash looped with "pg-boss is not installed" until the migration release step ran, which
  made `docker compose up --wait` fail. The worker now logs a warning every 5 seconds and keeps
  trying, so the stack reports healthy before the release step and starts working right after it.
  A test covers both the wait and a shutdown during it.
- **Tests use their own database.** Found during verification: with the stack up, its worker
  took the test suite's wake jobs and failed them with the stack's encryption key. The documented
  test command now points at `tbn_test`, which the migration step creates. CI already did.
- **Model ids are unique within a provider.** Found during verification: two models with the same
  id answered 500 from the unique index. The contract rejects that with 400 now.
- **Objections in the plan.** All five stand as written: `ask` answers the model with an error
  until the approval inbox in 1c; the breaker and out-of-credit blocking join the caps in 1b;
  compaction waits for 1b; the owner account comes from a one-off command; the event log and
  idempotent command ids come in phase 2.

## How it was verified

| Check | Here | CI |
| --- | --- | --- |
| Format, lint, typecheck, build | yes | yes |
| 99 Jest tests against PostgreSQL 18, including the worker kill and key redaction tests | yes | yes |
| Fresh stack: `up --wait` healthy before migrations, release step, owner creation, smoke test | yes | yes, smoke test |
| Demo script end to end against a fake model server, both reports downloaded | yes | no |
| Worker container killed with SIGKILL mid-call, both tasks finish after restart | yes | no |
| Demo keys absent from web and worker logs | yes | no |
| shellcheck on the demo script | no, not installed here | yes |
| Trivy, gitleaks, Semgrep, actionlint, `npm audit`, image push and signature | no | yes |
| Demo against real Anthropic and OpenAI endpoints | no, no keys here | no |

## Open questions and notes

- **Real providers.** Everything ran against fake servers that follow the two API formats and
  against the adapters' tests. The first run against real endpoints is yours, with the demo
  script. Prices are per model and optional, so cost reads zero until you set them.
- **Boot order.** `docker compose up --wait` now succeeds on a fresh database, but the worker
  only starts handling work after the migration release step; until then it logs "Queue is not
  ready" every 5 seconds. The smoke test runs the release step; the demo instructions above do
  too.
- **A dead worker's job.** pg-boss keeps the killed worker's `agent_wake` job active until it
  expires after six hours. It is harmless, because the run is resumed by a new wake, but it shows
  up in the queue table.
- **Model turn cap.** A run ends as failed after 100 model turns. The runaway guard in 1b replaces
  this with a pause and a question to you.
- **Image size.** Unchanged from phase 0, about 740 MB, mostly the Prisma CLI the release step
  needs.
- **Next.** The next phase is 1b when you name it.
