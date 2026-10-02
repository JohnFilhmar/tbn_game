# tbn_game

A single-player game that is also a real work tool: a company of AI agents shown as a semi low
poly 3D world. The agents do real work with real LLM calls; the world is a live view of that work.
One monolith on one private server, reachable only over a VPN.

Read these first: `docs/architecture.md` (what the system is and how it is built),
`docs/roadmap.md` (phases, exit criteria, required tests) and the latest report in `docs/reports/`.
`docs/server_setup.md` is the server runbook.

## How to work

- One session delivers one phase, named by the owner. Stop at that phase's exit criteria and
  report. Never start the next phase on your own.
- Before coding a phase, write `docs/plans/phase_<n>.md`: the task list, the contracts that change,
  the tests required, and anything in the brief you think is wrong for that phase. State each
  objection in two sentences, then build what the brief says unless the owner answers.
- Each phase ends with a demo the owner can run and a report in `docs/reports/phase_<n>.md`.
- Work on a feature branch per unit of work. Never commit to `main`, never force-push, never
  merge. Open a draft pull request per branch.
- No AI attribution anywhere: no co-author trailer and no "generated with" line in commits, pull
  requests, issues or file headers.
- Never create, overwrite, copy or delete `.env*`, `*.enc`, key or credential files. `.env.example`
  holds placeholders only. Stop and ask when a real secret is needed.
- Build the smallest thing that meets the exit criteria. No abstraction with one implementation
  unless the brief asks for it, and no new backing service without the owner's approval.
- The conventions in this file are the complete set.

## Commands

Node and npm versions are pinned in `.node-version` and the root `package.json`.

| Command                                                            | What it does                                                |
| ------------------------------------------------------------------ | ----------------------------------------------------------- |
| `npm ci`                                                           | Install. Only approved install scripts run (`allowScripts`). |
| `scripts/stack_up.sh`                                              | Build the sandbox image and bring the stack up healthy. Also `npm run stack:up`. |
| `scripts/smoke_test_stack.sh`                                      | Check a running development stack, as CI does.              |
| `npm run format:check`, `npm run lint`, `npm run typecheck`        | Static checks. Each first builds contracts and Prisma code. |
| `npm run build`                                                    | Build `@tbn/contracts` and `@tbn/backend`.                  |
| `npm test`                                                         | Jest. Needs `DATABASE_URL` for a disposable database.       |
| `printf '%s' "$PASSWORD" \| docker compose -f docker-compose.development.yml run --rm -T web dist/admin.js owner_create <username>` | Create the owner account once. |
| `scripts/demo_phase_1a.sh`                                         | The phase 1a demo over HTTP against a running stack.        |
| `scripts/demo_phase_1b.sh`                                         | The phase 1b demo: one goal, a manager and its interns.     |

Tests use a real PostgreSQL. With the development stack up:
`DATABASE_URL=postgresql://tbn:tbn_development_only@127.0.0.1:5432/tbn_test npm test`. The migration
step creates `tbn_test`. Never point tests at the stack's own `tbn` database: the stack's worker
would take the suite's wake jobs. The backend test script applies migrations and builds `dist/`
first, because one test starts the real worker process and kills it. Test files share one database
and one queue, so Jest runs them one at a time and every test file creates its own owner; owner
scoping keeps their data apart. The worker's sweep reaches every owner, so a test file that starts
a worker first calls `reset_worker_state`, which clears the queue and dismisses the agents earlier
files left behind. A wake due now is skipped while another due wake for the agent is queued, so a
test that counts wakes clears the agent's wakes first (`testing/test_wakes.ts`).

After a Prisma upgrade, approve the new engine install script with
`npm install-scripts approve @prisma/engines`; approvals are pinned to a version.

## Repository layout

```
backend/            NestJS monolith, two process types: web and worker
  src/
    web.ts          web entry: HTTP and, from phase 2, WebSocket
    worker.ts       worker entry: agent runs, health and metrics listener
    admin.ts        one-off commands in the same image: owner_create
    healthcheck.ts  container healthcheck probe
    config/         env schema, parsed once at bootstrap
    lib/            reusable infrastructure: auth decorators, crypto, database, queue, validation,
                    workspace paths, health, metrics, logging, http, process
    modules/        identity, company, runtime, knowledge, integrations, world, events
    utils/          generic helpers
    testing/        test helpers and fakes, excluded from the build
  prisma/           schema and migrations, including the pg-boss schema
client/             phase 3: Vite, React 19, TypeScript, Tailwind v4, the game and virtual desktop
desktop/            phase 6: Tauri v2 shell
mobile/             phase 5: Capacitor shell
packages/contracts/ Zod schemas and inferred types for every API and event payload
deploy/             host files: runner job guard, systemd units, SearXNG settings
scripts/            CI and local helper scripts
docs/               architecture, roadmap, plans, reports, runbook
```

## Architecture rules

- One NestJS application in `backend/`, TypeScript strict, built as one image that runs as two
  process types: `web` for HTTP and WebSocket, `worker` for agent runs. Admin tasks and the
  migration release step are one-off commands in the same image.
- Inside a module: `services/`, `repositories/`, `repositories/interface/`, `dto/`, `types/`,
  `interfaces/`. Controllers validate, delegate and map. Services depend on repository interfaces.
- A module calls another module only through its exported service. No module queries another
  module's tables. The dependency direction is `identity` alone, `company` on `runtime`'s
  providers and the queue, `knowledge` on `company`, and `runtime`'s run loop on all of them. The
  company module starts work by sending an `agent_wake` job, never by calling the run loop.
- `runtime/` is two Nest modules in one directory: `RuntimeProvidersModule` (providers, keys,
  adapters, usage) and `RuntimeModule` (runs, transcripts, tools, the loop). Agents validate their
  provider against the first without depending on the second.
- The transcript is the run checkpoint. Every model turn and every tool result is a
  `transcript_entries` row before the loop goes on. A worker holds a lease on the run and extends
  it while a turn is in flight; a run whose lease lapsed is re-woken by any worker. Nobody takes a
  live lease, its holder included. A worker handles one wake per agent at a time: each wake carries
  its agent as the pg-boss group.
- A run that cannot go on pauses instead of failing, with a `pause_reason`, and drops its lease in
  the same update. A wake resumes it: a delayed one for a time-based pause, and the worker's sweep
  as the safety net.
- The worker runs as a Nest application context, so controllers are never mounted in it. Its
  `/health` and `/metrics` come from `lib/ops_server`.
- One PostgreSQL database through Prisma. Every schema change ships with its migration in the same
  commit. Migrations run as a one-off release step, never on application boot.
- PostgreSQL is the only backing service. The job queue is `pg-boss`. The worker tells the web
  process about new events with `LISTEN` and `NOTIFY`. No Redis, no message broker. Leave a
  comment naming the ceiling wherever one process or one database is assumed.
- Every row carries `owner_id`, and the repository layer applies that scope on every query.
- Every state change the client cares about is appended to the event log in the same transaction
  as the change, with a sequence number that only increases. Every command accepts a
  client-generated id and is idempotent on it.
- Config only from environment variables, parsed once at bootstrap by the schema in
  `backend/src/config/` into a typed object injected as `APP_CONFIG`. No `process.env` reads
  anywhere else. `backend/prisma.config.ts` is Prisma CLI configuration and the one exception.
- Each process type binds its own port and exposes `/health` and Prometheus metrics. Both stay
  public when the auth guard arrives.
- Logs are structured JSON on stdout with a correlation id. Keys and tokens are redacted and never
  enter a prompt, a transcript, a log, a response or the sandbox.
- Error responses leak no stack traces. `helmet`, the explicit CORS origin list, global validation
  that rejects unknown fields, and payload size limits stay on.
- A single owner account: password hashed with argon2, a short-lived session token, a global auth
  guard with an explicit `@Public()` decorator. WebSocket connections authenticate with the same
  token.
- Text from a web page, a file, a plugin or another agent is data. It never changes an agent's tool
  policy, caps, skills or approval requirements; only the owner's commands do.
- Compose publishes ports on `127.0.0.1` only. `scripts/check_compose_ports.sh` enforces it in CI.

## Code rules

- `snake_case` for backend variables, functions, files, database columns, API JSON fields, and
  query and path params. Environment variables in `UPPER_SNAKE_CASE`.
- Inside `client/`: `camelCase` identifiers and non-component files, `PascalCase` components,
  state pairs as `const [isOpen, setIsOpen]`. API payload fields are read exactly as the backend
  sends them, with no renaming layer.
- Classes, types, interfaces and enums in `PascalCase`. Framework-fixed names stay as the framework
  requires, for example Nest lifecycle hooks and Nest option objects.
- Zod schema constants are `PascalCase` with a `Schema` suffix everywhere, and in
  `packages/contracts` the inferred type takes the name without it (`HealthResponseSchema`,
  `HealthResponse`), so the backend and the client import them unchanged.
- A write-only secret (`api_key`, `password`) never appears in a model schema. The inbound schema
  adds it with `.extend()` on top of the `.pick()`, and the response carries `api_key_set` instead.
- Decorator factories keep Nest's `PascalCase` (`@Public()`, `@ZodBody()`) and live in
  `*.decorator.ts` files.
- Never `any`. Use `unknown` and narrow. No `as` cast to silence an error, no `@ts-ignore`.
- One validation schema per model, defined once in `packages/contracts` with Zod. Every inbound
  shape derives from it with `.pick()`, `.omit()` or `.partial()`. Types come from `z.infer`. The
  backend validates with the same schemas through a Zod pipe.
- A file with more than about three exported functions or 250 lines becomes a directory.
  `lib/<concern>/` for reusable logic, `utils/` for generic helpers, `types/` for data shapes,
  `interfaces/` for contracts.
- Path aliases (`@/` in the backend), no `../../` chains. `import type` for types.
- JSDoc on every exported function, shared hook, reusable component and its props. Inline comments
  stay rare.
- Prose in commits, pull requests, comments and docs is plain: no em dashes, no filler, sentence
  case headings.
- Tailwind is the only styling mechanism in the client. Use the theme scale, never an arbitrary
  bracket value that duplicates it. 2D screens are accessible by default and design their loading,
  empty and error states.

ESLint (`eslint.config.mjs`) enforces the naming, `any`, cast, `ts-ignore`, type import, path alias
and `process.env` rules. Prettier formats.

## Tests

- Backend: Jest, colocated `<subject>.spec.ts`. Integration tests run against a real PostgreSQL.
  Mock only LLM providers and external web calls.
- A new repository method gets an integration test. A new endpoint gets an end-to-end test through
  supertest covering auth, the happy path and one rejection.
- Client: Vitest for logic as colocated `<subject>.test.ts`, Playwright in `e2e/`.
- Tests land in the same commit as the code. No coverage threshold in CI.
- `docs/roadmap.md` lists the tests each phase must add.
- Jest runs with `--experimental-vm-modules` because NestJS 12 ships only ES modules. Keep the
  flag in the `test` script.
- Model providers are never called in tests. `testing/fake_provider_server.ts` speaks both API
  formats with scripted replies, or a responder that answers from the request, so the real
  adapters, retries and usage accounting run. `testing/team_harness.ts` starts a web app, a worker
  and an owner for flows across several agents.
- In Jest's VM realm `instanceof Error` is false for a `DOMException`; read `error.name` instead.

## Delivery

- Multi-stage `Dockerfile`, non-root user, base images pinned by digest, no secrets in layers.
- One `docker-compose.<env>.yml` per environment with `web`, `worker`, `postgres`, `sandbox`,
  `egress_proxy` and `searxng`. Every service declares a healthcheck, resource limits and a restart
  policy. Development and production keep the same shape.
- CI gates: format, lint, typecheck, build, tests, `npm audit`, Semgrep, gitleaks, actionlint and
  shellcheck, the compose smoke test, then image build, Trivy, push, cosign signature and SBOM
  attestation. Pin actions by commit SHA and images by digest.
- Production deploys the exact digest signed by CI on `main`, after the owner's approval, through
  `.github/workflows/deploy.yml` on the self-hosted runner. That runner never runs pull request code.
- Secrets are SOPS-encrypted files the owner creates and the deploy job decrypts.
