# Phase 0 plan: foundations

## Goal

Lay the ground every later phase builds on: the repository layout, `CLAUDE.md`, a NestJS monolith
with empty domain modules running as two process types, health and metrics endpoints, a development
compose stack, CI with every gate from the brief, a deploy workflow, and the server runbook.

## Exit criteria

- One command brings the development stack up healthy:
  `docker compose -f docker-compose.development.yml up --build --wait` (or `npm run stack:up`).
- CI is green on the draft pull request.
- The deploy workflow is documented and waits only on the server and the secrets.

Docker runs inside this session, so I verify the stack locally and again in CI. The report says
which checks ran where.

## Toolchain

| Area            | Choice                                    | Reason                                                                                      |
| --------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------- |
| Node            | 24.21.0 LTS                               | Current LTS. Node 26 becomes LTS later in October.                                          |
| TypeScript      | 6.0.3                                     | 7.0 is out, but typescript-eslint, ts-jest and the Nest CLI support only 6.0.               |
| NestJS          | 12.1, compiled to CommonJS                | Nest 12 ships ES modules only. Node 24 loads them from CommonJS, as the Nest 12 starter does. |
| Prisma          | 7.10 with the `pg` driver adapter         | Current stable. The CLI `latest` tag points at an 8.0 release candidate, so I pin 7.10.     |
| Validation      | Zod 4.6                                   |                                                                                             |
| Tests           | Jest 30 with SWC, supertest               |                                                                                             |
| Logging         | pino through nestjs-pino                  | JSON on stdout, request ids, redaction.                                                     |
| Metrics         | prom-client                               |                                                                                             |
| Packages        | npm 11 workspaces                         | Ships with Node. npm 11 runs no install script unless `allowScripts` approves it.           |
| Build image     | `node:24.21.0-trixie-slim`                |                                                                                             |
| Runtime image   | `gcr.io/distroless/nodejs24-debian13`     | No shell and no package manager in the shipped image. Runs as uid 65532.                    |
| PostgreSQL      | 18.6                                      | 19 is still in beta.                                                                        |

## Tasks

1. Root: npm workspaces (`packages/contracts`, `backend`), `.node-version`, `.npmrc`, `.gitignore`,
   `.dockerignore`, ESLint and Prettier configs, `README.md`, `CLAUDE.md`, `.env.example`.
2. `packages/contracts`: the `@tbn/contracts` package with the health response schema.
3. `backend`:
   - a config schema parsed once at bootstrap into a typed object;
   - JSON logging with redaction and request ids;
   - Prisma with an empty schema and the `pg` adapter;
   - health and metrics, and the seven empty domain modules;
   - `web.ts`: HTTP with helmet, a CORS origin list and a body size limit;
   - `worker.ts`: an application context plus a small HTTP listener for health and metrics;
   - graceful shutdown on SIGTERM, and `healthcheck.ts` for the container healthchecks.
4. `Dockerfile`: multi-stage, pinned digests, non-root, no secrets in layers. One image serves both
   process types and the migration release step.
5. `docker-compose.development.yml` and `docker-compose.production.yml` with `web`, `worker`,
   `postgres`, `sandbox`, `egress_proxy` and `searxng`. Every service declares a healthcheck,
   resource limits and `restart: unless-stopped`. Ports publish on `127.0.0.1` only.
6. Workflows:
   - `.github/workflows/ci.yml` runs these gates:
     - lint, typecheck, build, and tests against PostgreSQL;
     - Semgrep, gitleaks, dependency scanning and a compose smoke test;
     - then image build, Trivy, push, the cosign signature and the SBOM attestation.
   - `.github/workflows/deploy.yml` deploys a signed digest by hand. It runs on the self-hosted
     runner in the `production` environment.
   - `.github/dependabot.yml` keeps the pins fresh.
7. Docs and host files:
   - `docs/architecture.md`, `docs/roadmap.md` and `docs/server_setup.md`;
   - under `deploy/`: the runner guard hook, the unhealthy container restart timer and the SearXNG
     settings.
8. Push, open the draft pull request, drive CI to green, write `docs/reports/phase_0.md`.

## Contracts that change

Everything is new.

- `@tbn/contracts`: `ProcessTypeSchema`, `HealthCheckStatusSchema`, `HealthResponseSchema`.
- HTTP: `GET /health` and `GET /metrics` on the web port (3000) and on the worker port (3001).
  - `/health` answers 200 with `status: ok` when PostgreSQL answers within 2 seconds, else 503
    with `status: unavailable`.
  - Both routes are public. The phase 1a auth guard must keep them public.
- Environment: `NODE_ENV`, `LOG_LEVEL`, `WEB_PORT`, `WORKER_PORT`, `DATABASE_URL`,
  `DATABASE_POOL_MAX`, `CORS_ORIGINS`, `HTTP_BODY_LIMIT_BYTES`, `SHUTDOWN_TIMEOUT_MS` and
  `GIT_COMMIT_SHA`. The compose files add `POSTGRES_PASSWORD`, `SEARXNG_SECRET` and `BACKEND_IMAGE`.
- Image: `ghcr.io/johnfilhmar/tbn_game/backend`.
  - Commands: `dist/web.js`, `dist/worker.js`, `dist/healthcheck.js <process_type>`, and the
    Prisma CLI for `migrate deploy`.
  - Images built on `main` are signed by `.github/workflows/ci.yml@refs/heads/main`. The deploy
    workflow accepts no other signer.
- Compose: the six service names, the `backend` network, the internal `sandbox` network, and the
  volumes `postgres_data`, `workspace` and `searxng_cache`.

## Tests required

The Jest tests are colocated `.spec.ts` files and run against a real PostgreSQL.

- Config: a valid environment parses with defaults. These are rejected:
  - a missing or non-PostgreSQL `DATABASE_URL`;
  - a bad port;
  - an unknown `NODE_ENV`.
- Web `GET /health` through supertest:
  - it needs no credentials;
  - it returns 200 with a body that matches `HealthResponseSchema`;
  - it returns 503 when the database is unreachable;
  - security headers are present.
- Web `GET /metrics` returns Prometheus text labelled `process_type="web"`.
- Web unknown route: 404 with no stack trace in the body.
- Worker listener: `/health` and `/metrics` answer, unknown paths get 404, and the listener closes
  with the context.

The CI compose smoke test checks that:

- the stack comes up healthy;
- both `/health` endpoints report the database as ok, and `/metrics` answers;
- every published port in both compose files is bound to `127.0.0.1`;
- the migration release step runs;
- the sandbox cannot reach `web`, `postgres` or the internet;
- `web` and `worker` exit 0 on SIGTERM.

## Where I think the brief is wrong for this phase

1. **Sandbox and egress proxy.** The brief puts both in the phase 0 compose file, but their design
   waits on your approval in phase 1c. I ship them as idle placeholders on an internal network with
   nothing listening, so all sandbox egress fails closed until 1c replaces them.
2. **Restart on unhealthy.** Docker without Swarm restarts a crashed container but never an
   unhealthy one. I add a systemd timer on the host that restarts unhealthy containers of the
   stack, so no container needs the docker socket for this.
3. **Jest with NestJS 12.** Nest 12 ships only ES modules, so Jest needs Node's
   `--experimental-vm-modules` flag to load it. I keep Jest as the brief says and set the flag in
   the test script. If the flag ever breaks, Vitest is the fallback.
4. **Observability and backups have no phase.** No phase includes Prometheus, Grafana or the weekly
   backups. I put them in phase 2 next to the first production deploy, and phase 0 only exposes
   `/metrics`.

## Notes

- The repository was empty. With your approval `main` holds one empty commit, so the draft pull
  request has a base. All phase 0 work arrives through the pull request.
- The release step runs `prisma migrate deploy` with `docker compose run` on the `web` service
  definition. The compose files keep exactly six long-running services.
- The repository is public, so the "required reviewers" rule on the `production` environment is
  available on every GitHub plan. As a second guard, a hook on the self-hosted runner refuses every
  job except a deploy dispatched from `main` by you.
- CI signs pull request images too, with the pull request identity, so the signing gate is proven
  before merge. Signatures go to the public Sigstore log, which is fine for a public repository.
