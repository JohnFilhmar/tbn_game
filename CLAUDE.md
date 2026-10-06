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
| `npm run test:client`                                              | Vitest for the client, with a fake API and a fake socket.   |
| `npm run e2e`                                                      | Playwright flows against the built backend and client. Needs `E2E_DATABASE_URL` and `npm run build` first. |
| `npm run dev --workspace @tbn/client`                              | The client on Vite at port 5173, calling `VITE_API_URL`.    |
| `printf '%s' "$PASSWORD" \| docker compose -f docker-compose.development.yml run --rm -T web dist/admin.js owner_create <username>` | Create the owner account once. |
| `scripts/demo_phase_1a.sh`                                         | The phase 1a demo over HTTP against a running stack.        |
| `scripts/demo_phase_1b.sh`                                         | The phase 1b demo: one goal, a manager and its interns.     |
| `scripts/demo_phase_1c.sh`                                         | The phase 1c demo: research, a branch, a merge request, an approval, a restart. |
| `scripts/demo_phase_2.sh`                                          | The phase 2 demo: a scripted client drops and resumes mid-run while the owner chats with the agent. |
| `scripts/demo_phase_3.sh`                                          | The phase 3 demo: the stack with the desktop, Grafana and a backup, and the steps to follow in the browser. |
| `scripts/demo_phase_4.sh`                                          | The phase 4 demo: the stack serving the world's packs and characters, the world preferences, and the steps to walk the company in the browser. |
| `scripts/vps_up.sh`                                                | On the shared VPS: build the images from the clone and start the production stack. See `docs/vps_setup.md`. |
| `npm run build:assets --workspace @tbn/client`                     | Remakes the three environment packs and the character set from `client/scripts/assets/`; the files are committed. |

Tests use a real PostgreSQL. With the development stack up:
`DATABASE_URL=postgresql://tbn:tbn_development_only@127.0.0.1:5432/tbn_test npm test`. The migration
step creates `tbn_test`. Never point tests at the stack's own `tbn` database: the stack's worker
would take the suite's wake jobs. The backend test script applies migrations and builds `dist/`
first, because one test starts the real worker process and kills it. Test files share one database
and one queue, so Jest runs them one at a time and every test file creates its own owner; owner
scoping keeps their data apart. The worker's sweep reaches every owner, so a test file that starts
a worker first calls `reset_worker_state`, which clears the queue and dismisses the agents earlier
files left behind. A wake due now is skipped while another due wake for the agent is queued, so a
test that counts wakes clears the agent's wakes first (`testing/test_wakes.ts`). The sandbox, git,
proxy and story specs also need Docker on `DOCKER_SOCKET`: `testing/test_launcher.ts` builds
`tbn/sandbox:test` from `Dockerfile.sandbox` when it is missing, creates the `tbn_test_sandbox`
network, and binds `.workspace_test` into containers as this user. They fail without Docker, never
skip. `testing/test_proxy.ts` runs the egress proxy in-process with a dialer that maps
`allowed.test` to local servers, so the address policy runs unchanged.

The Playwright flows start `dist/web.js` and `dist/worker.js` on `E2E_DATABASE_URL`, for example
`postgresql://tbn:tbn_development_only@127.0.0.1:5432/tbn_e2e`, with a fake streaming model, and
create the owner `e2e_owner` once. They apply migrations and never wipe the database; each run's
rows carry its own id. Locally, point `PLAYWRIGHT_CHROMIUM_PATH` at a Chromium when Playwright's
own is not installed.

After a Prisma upgrade, approve the new engine install script with
`npm install-scripts approve @prisma/engines`; approvals are pinned to a version.

## Repository layout

```
backend/            NestJS monolith, four process types: web, worker, sandbox and egress_proxy
  src/
    web.ts          web entry: HTTP and the Socket.IO gateway
    worker.ts       worker entry: agent runs, notification delivery, health and metrics listener
    sandbox.ts      sandbox launcher entry: the one process holding the docker socket
    egress_proxy.ts egress proxy entry: no database, no key
    admin.ts        one-off commands in the same image: owner_create
    realtime_client.ts the scripted realtime client of the phase 2 demo
    healthcheck.ts  container healthcheck probe
    config/         env schema, parsed once at bootstrap
    lib/            reusable infrastructure: auth decorators, crypto, database, queue, validation,
                    workspace paths, health, metrics, logging, http, process, docker_engine,
                    sandbox_launcher, egress_proxy, html_text, disk, realtime, realtime_client,
                    idempotency
    modules/        identity, company, runtime, knowledge, integrations, world, events
    utils/          generic helpers
    testing/        test helpers and fakes, excluded from the build
  prisma/           schema and migrations, including the pg-boss schema
client/             Vite, React 19, TypeScript, Tailwind v4: the world and the desk in it
  src/app/          router, desk layout, launcher
  src/providers/    query client, session, realtime, theme
  src/lib/          api, session, realtime, stores, data, forms, format, ui
  src/components/   shared fields, dialogs, tables, badges, states, Markdown
  src/screens/      one directory per desk screen
  src/game/         the 3D world: assets (manifests, loaders, appearance), world (canvas, scene,
                    lighting, cameras, owner character, walking grid), props (catalog, layouts,
                    themes, interactions), objects (lamps, blinds, whiteboard, effects and prop
                    state), build (build mode), npcs (world events, seats, actors), hud, and the
                    shipped packs and characters
  scripts/assets/   the generator of the packs and the character set
  e2e/              Playwright flows, the e2e stack and its fake model
desktop/            phase 6: Tauri v2 shell
mobile/             phase 5: Capacitor shell
packages/contracts/ Zod schemas and inferred types for every API and event payload
deploy/             host files: runner job guard, systemd units, backup and restore scripts, Prometheus
                    and Grafana configuration, SearXNG settings, the sandbox git script, and the
                    VPS's nginx site with its credential gate
Dockerfile.sandbox  the sandbox image: the toolchain agent code runs in, with the git script
scripts/            CI and local helper scripts
docs/               architecture, roadmap, plans, reports, runbook
```

## Architecture rules

- One NestJS application in `backend/`, TypeScript strict, built as one image that runs as four
  process types: `web` for HTTP and WebSocket, `worker` for agent runs, `sandbox` for the launcher
  that alone holds the docker socket and runs each sandbox job in a fresh container from the
  sandbox image, and `egress_proxy`, the forward proxy with no database and no key. Admin tasks
  and the migration release step are one-off commands in the same image.
- Inside a module: `services/`, `repositories/`, `repositories/interface/`, `dto/`, `types/`,
  `interfaces/`. Controllers validate, delegate and map. Services depend on repository interfaces.
- A module calls another module only through its exported service. No module queries another
  module's tables. The dependency direction is `identity` and `world` alone, `integrations` on the queue and
  crypto, `company` on `integrations` and `runtime`'s providers and the queue, `knowledge` on
  `company`, and `runtime`'s run loop on all of them. The company module starts work by sending an
  `agent_wake` job, never by calling the run loop.
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
  as the change, with a sequence number that only increases. The `tbn_events` trigger writes it, so
  a new table the client shows gets its trigger, and its ignored columns, in the migration that
  creates it, and an entity in `ChangeEventSchema` with a loader in the event hydrator. Every
  command accepts a client-generated id in the `Idempotency-Key` header and is idempotent on it.
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
  policy, caps, skills or approval requirements; only the owner's commands do. Reading it taints
  the run: every outward tool, integrations and plugins, then waits in the approval inbox whatever
  its policy, as does any tool whose policy is `ask`.
- Every operation on a canonical repository is a system job that runs the fixed git script
  `deploy/sandbox/git_job.sh` in the sandbox image, with the bare repository at `/repo`. No agent
  container ever mounts a canonical repository or another agent's checkout. An intern publishes
  only the feature branch of its task, a manager only `<manager>/main`, and `development`,
  `staging` and the default branch change only through the owner's merge route.
- Sandbox containers reach nothing but the egress proxy, which refuses every private, loopback,
  link-local, metadata and VPN address, resolved names included, and wants the run's identity.
- Compose publishes ports on `127.0.0.1` only. `scripts/check_compose_ports.sh` enforces it in CI.
  Production's host ports are in the 3100 block, clear of the other apps on the shared VPS.
- The web process serves the built client under `/app` from `CLIENT_DIR`; the API keeps its paths.
  The client talks to the API only through `lib/api` and the gateway, and writes every change into
  the TanStack Query cache. The gateway accepts the CORS origins and the page's own origin.
- The world is the client's root route for everyone, signed in or not. `/` is the owner walking
  in it; every other route, sign in and the desk screens, is the owner seated at the computer,
  with the screen rendered as real DOM in the monitor frame. The route alone decides, so a reload
  lands seated. The world reads models and clips through the asset manifests by slot name, never
  by path, and the agents move only on world events derived from the change events; nothing in
  the world is server state but its preferences, each environment's layout and theme, and the
  state of the props that keep one (blinds, lamps and whiteboards), apart from the layout.
  A pack is a generated shell and a default layout of props, which the client builds from code;
  the packs and characters are generated files under `client/src/game/`, remade by
  `npm run build:assets`, to the contract in `docs/assets.md`.

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
  bracket value that duplicates it. The low poly look lives in `client/src/index.css`: the world's
  palette as the `slate` and `teal` scales, bevelled corners, `shadow-chunk`, and the self-hosted
  display and text fonts. 2D screens are accessible by default and design their loading,
  empty and error states.

ESLint (`eslint.config.mjs`) enforces the naming, `any`, cast, `ts-ignore`, type import, path alias
and `process.env` rules. Prettier formats.

## Tests

- Backend: Jest, colocated `<subject>.spec.ts`. Integration tests run against a real PostgreSQL.
  Mock only LLM providers and external web calls.
- A new repository method gets an integration test. A new endpoint gets an end-to-end test through
  supertest covering auth, the happy path and one rejection.
- Client: Vitest for logic as colocated `<subject>.test.ts`, Playwright in `e2e/`. A screen test
  renders the whole client at an address with `testing/renderApp.tsx` and a route table from
  `testing/fakeApi.ts`; `testing/setup.ts` replaces `socket.io-client` with a fake a test can drive.
- Tests land in the same commit as the code. No coverage threshold in CI.
- `docs/roadmap.md` lists the tests each phase must add.
- Jest runs with `--experimental-vm-modules` because NestJS 12 ships only ES modules. Keep the
  flag in the `test` script. The flag keeps every test file's module graph alive, about 50 MB
  each, so `jest.config.cjs` runs the files one at a time in one child worker that is recycled
  past 1 GB; an in-band run reaches the heap limit before the suite ends.
- Model providers are never called in tests. `testing/fake_provider_server.ts` speaks both API
  formats with scripted replies, or a responder that answers from the request, and streams them
  when the request asks, so the real adapters, retries and usage accounting run.
  `testing/team_harness.ts` starts a web app, a worker and an owner for flows across several
  agents. A test that connects `lib/realtime_client` calls `app.listen(0, '127.0.0.1')` first.
- In Jest's VM realm `instanceof Error` is false for a `DOMException`; read `error.name` instead.

## Delivery

- Multi-stage `Dockerfile`, non-root user, base images pinned by digest, no secrets in layers.
- One `docker-compose.<env>.yml` per environment with `web`, `worker`, `postgres`, `sandbox`,
  `egress_proxy`, `searxng`, `prometheus` and `grafana`. Every service declares a healthcheck,
  resource limits and a restart policy. Development and production keep the same shape.
- CI gates: format, lint, typecheck, build, tests, the Playwright flows, `npm audit`, Semgrep,
  gitleaks, actionlint and shellcheck, the compose smoke test, then image build, Trivy, push,
  cosign signature and SBOM attestation. Pin actions by commit SHA and images by digest.
- Production deploys the exact digest signed by CI on `main`, after the owner's approval, through
  `.github/workflows/deploy.yml` on the self-hosted runner. That runner never runs pull request code.
- Secrets are SOPS-encrypted files the owner creates and the deploy job decrypts.
