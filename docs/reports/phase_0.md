# Phase 0 report: foundations

## Outcome

Phase 0 meets its exit criteria.

- **One command brings the stack up healthy.** `docker compose -f docker-compose.development.yml up --build --wait`
  starts all six services healthy. Docker ran inside this session, so I verified this locally, and
  CI verifies it on every push in the compose smoke test job.
- **CI is green on the draft pull request**,
  [JohnFilhmar/tbn_game#1](https://github.com/JohnFilhmar/tbn_game/pull/1), with every gate.
  - In [run 3](https://github.com/JohnFilhmar/tbn_game/actions/runs/36970472051), the image job
    pushed `ghcr.io/johnfilhmar/tbn_game/backend@sha256:7dad9d1bca3e0abe93efc2d9721795bd9370dddd4f7d4cbea259339c95dfb188`.
  - It signed that image with cosign, attested its SBOM, and verified both the way the deploy
    workflow will.
  - The verification ran against the pull request identity, which the deploy workflow refuses.
- **The deploy workflow is documented and waits only on your server and secrets.**
  `.github/workflows/deploy.yml` and `docs/server_setup.md` are complete. Nothing in them can run
  until the server, the runner, the `production` environment and the SOPS file exist.

## Demo

With Docker and the compose plugin:

```
docker compose -f docker-compose.development.yml up --build --wait
curl http://127.0.0.1:3000/health
curl http://127.0.0.1:3001/health
curl http://127.0.0.1:3000/metrics
scripts/smoke_test_stack.sh
docker compose -f docker-compose.development.yml down --volumes
```

`/health` answers
`{"status":"ok","process_type":"web","commit_sha":"<commit>","checks":{"database":"ok"}}` and turns 503 when
PostgreSQL is unreachable. The smoke test also runs the migration release step, checks that the
sandbox reaches nothing, and checks that web and worker exit 0 on SIGTERM.

## What was done

- **Repository.** npm workspaces with `packages/contracts` (`@tbn/contracts`, the health schema) and
  `backend` (`@tbn/backend`). The repository also has `CLAUDE.md`, `.env.example`, `README.md`, the
  docs, and the ESLint and Prettier configs that enforce the code rules.
- **Backend.** One NestJS 12 codebase with two entry points.
  - `web` serves HTTP with helmet, an explicit CORS origin list and body size limits.
  - `worker` is an application context, so controllers are never mounted in it. A small listener
    serves its health and metrics.
  - The backend also has:
    - a Zod config schema parsed once at bootstrap;
    - JSON logs with request ids and redaction;
    - `@prometheus-io/client` metrics labelled by process type;
    - a Prisma 7 client with an empty schema;
    - graceful shutdown with a timeout;
    - a healthcheck probe;
    - the seven empty domain modules.
- **Tests.** Twenty Jest tests run against a real PostgreSQL:
  - config parsing and rejection, with no values echoed;
  - `/health` returns 200 and 503 and matches the contract;
  - `/metrics`;
  - security headers, CORS, 413 on oversized bodies, and 404 with no stack trace;
  - the worker listener's routes and its shutdown;
  - the timeout helper.
- **Image.** A multi-stage `Dockerfile` with every base pinned by digest and a distroless Node 24
  runtime as uid 65532. One image runs web, worker and `prisma migrate deploy`.
- **Compose.** `docker-compose.development.yml` and `docker-compose.production.yml` have the same
  six services. Every service has a healthcheck, resource limits and `restart: unless-stopped`, and
  all of them run read-only where possible, without capabilities, with log rotation and with ports
  on `127.0.0.1` only. `sandbox` and `egress_proxy` are idle placeholders on an internal network.
  SearXNG runs the upstream image with its settings file.
- **CI** (`.github/workflows/ci.yml`) runs these gates:
  - format, lint, typecheck, build and tests;
  - `npm audit` at high severity, and `npm audit signatures`;
  - Semgrep with the default, TypeScript, Node, Dockerfile, compose, GitHub Actions and secrets
    rules;
  - gitleaks over the full history;
  - actionlint and shellcheck;
  - the compose smoke test with the port check on both compose files.

  When all of them pass, the image job runs Trivy on the image and on the Dockerfile, writes a
  CycloneDX SBOM, pushes the image to GHCR, signs the digest with keyless cosign, attests the SBOM
  and verifies both. Actions are pinned by commit SHA and images by digest.
- **Deploy** (`.github/workflows/deploy.yml`). It is dispatched by hand from `main` with a digest
  and runs in the `production` environment on the `tbn-production` runner. In order, it:
  1. verifies that the image was signed by CI on `main`;
  2. decrypts the SOPS file;
  3. stages the stack in `/opt/tbn`;
  4. runs migrations as a release step;
  5. starts the stack;
  6. checks that `/health` reports the deployed commit.
- **Host files.**
  - `deploy/runner/job_started_guard.sh` admits only your dispatch of `deploy.yml` from `main` and
    refuses everything else. I tested it with eight cases: one admitted and seven refused.
  - `deploy/host/tbn_restart_unhealthy.*` is a systemd timer that restarts unhealthy containers.
- **Docs.**
  - `CLAUDE.md`: every convention.
  - `docs/architecture.md`: the brief's product requirements and architecture, the current state
    and the phase 0 decisions.
  - `docs/roadmap.md`: every phase with its exit and required tests.
  - `docs/server_setup.md`: firewall, Tailscale, runner and guard, GitHub settings, SOPS, restart
    timer, first deploy, operations.

## What was decided

- **Toolchain.**
  - Node 24.21 LTS and TypeScript 6.0.3. TypeScript 7 is out, but typescript-eslint, ts-jest and
    the Nest CLI do not support it yet.
  - NestJS 12, which ships only ES modules, compiled to CommonJS and loaded through Node's
    `require(esm)`, as the Nest 12 starter does.
  - Prisma 7.10 with the `pg` adapter.
  - Zod 4.6 and Jest 30 with SWC.
- **Jest flag.** Jest runs with `--experimental-vm-modules` to load Nest's ES modules. This was
  objection 3 in the plan.
- **Supply chain.**
  - npm installs only versions published more than 7 days ago (`min-release-age=7`).
  - Only Prisma's engine download may run an install script (`allowScripts`).
  - Two Prisma CLI transitive dependencies are overridden past published high severity advisories:
    `mysql2` to 3.24.4 and `deepmerge-ts` to 8.0.2.
  - Dependabot proposes grouped monthly updates with a 7 day cooldown.
  - Semgrep asked for the release age and the cooldown on the first CI run.
  - `prom-client` is deprecated, so metrics use its successor, `@prometheus-io/client`.
- **Sandbox and egress proxy.** Both are idle placeholders that fail closed until phase 1c designs
  them (objection 1).
- **Unhealthy containers.** A host systemd timer restarts unhealthy containers, because Docker never
  does (objection 2).
- **Observability and backups.** Prometheus and Grafana dashboards and the weekly backups are
  proposed for phase 2 (objection 4).
- **Deploy stack directory.** The deploy stages the stack in `/opt/tbn`, so the running services do
  not depend on the runner's checkout.
- **Contracts naming.** Schemas are `XSchema` and inferred types are `X`, so the snake_case backend
  and the camelCase client import them unchanged. The brief did not cover this.

## How it was verified

| Check | Here | CI |
| --- | --- | --- |
| Format, lint, typecheck, build | yes | yes |
| 20 Jest tests against PostgreSQL 18 | yes | yes |
| Stack up healthy with one command, smoke test | yes | yes |
| Ports bound to 127.0.0.1 in both compose files, and a negative case | yes | yes |
| Trivy on the image and the Dockerfile | yes | yes |
| gitleaks over history; SOPS-style ciphertext not flagged | yes | yes |
| actionlint, shellcheck | yes | yes |
| `npm audit`, `npm audit signatures` | audit only | yes |
| Semgrep | public rules repository only; semgrep.dev is blocked from this session | registry rules |
| Push, cosign signature, SBOM attestation, verification | no | yes, pull request identity |
| Runner guard | 8 cases with sample variables | not applicable |
| Deploy workflow end to end | no server | not run |

## Open questions and notes

- **The empty `main` commit.** With your approval, `main` holds one empty commit so that the draft
  pull request has a base. Nothing else was committed to `main`.
- **Commit author.** Commits carry the git identity this session was configured with, and no
  trailer or "generated with" line. Tell me if you want a different author identity for later
  phases.
- **Secrets file.** The SOPS file lives in the public repository. Its values are encrypted, but its
  variable names are readable. If you would rather keep it only on the server, the deploy workflow
  needs one path change.
- **Image size.** The image is about 700 MB, mostly the Prisma CLI that the release step needs. If
  it matters, phase 1a can trim Prisma Studio and the `prisma dev` server from the runtime layer.
- **Hook check.** I could not read GitHub's documentation from this session, because
  docs.github.com is blocked here. The runner hook behaviour, a failing job-started hook fails the
  job, follows GitHub's design as I know it. The runbook includes an end-to-end check with a
  throwaway workflow before you trust it.
- **Next.** The next phase is 1a when you name it.
