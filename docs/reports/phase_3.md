# Phase 3 report: web app without 3D

## Outcome

Phase 3 meets its exit criteria as far as this session can take them: the whole company runs from
the browser, served by the stack itself, and everything up to the production deploy is built and
checked. The deploy itself runs on your server with your secrets, as you decided, so it is the
one step left for you.

- **The six flows.** Playwright signs in, adds a provider, recruits a manager and chats with it,
  assigns a task, approves the agent's call and reads the report, against the built web process
  and worker on a real PostgreSQL with a fake model that streams in the Anthropic format. All six
  pass, three runs in a row at the end, and green after every client change before that. The chat
  check sees the reply being written in the chat and then the stored reply in its place; the
  approval check reads the exact input and the note; the report check renders the Markdown and
  downloads the `.md`.
- **Every screen.** Sign in, agents with chat, profile, tools, runs and tasks, recruiting,
  departments, the task board and each task, the approval inbox, reports, repositories with branch
  reviews, merge requests, sandbox jobs, providers with usage and caps, search providers,
  integrations with a test call, notification channels and the log, plugins and their tools,
  skills with import, export and attachments, instructions, every preference and the cache
  savings. Each has its loading, empty and error states, labels, focus states and keyboard paths,
  in both themes and at phone width. A screenshot pass over every screen caught a few layout
  issues, fixed before the last commit.
- **Served by the stack.** The web process serves the client under `/app` from the image. Against
  the development stack built from this branch, a browser signed in, went live over the same
  origin and opened eight screens with no console error.
- **Monitoring and backups.** All eight services came up healthy. Prometheus scraped all four
  processes, Grafana answered healthy with its data source and the tbn overview dashboard, and
  every dashboard query ran. Backups ran with rotation, the failure path sent its notice, and a
  restore round trip removed a rule and a file made after the backup while keeping ownership.
- **Tests.** 38 Vitest tests for the client, the six Playwright flows, and the backend suite of
  413 tests in 83 files, all passing. CI is green on the pull request, including both image jobs
  with Trivy and signing.

## What could not be run here

- **The production deploy.** It needs your server, your tailnet, the SOPS key and the signed
  images from CI on `main`. The workflow, the runbook and the compose file are ready; see below.
- **A real model.** Every flow ran against a fake. The demo script prints the browser steps to
  follow with your key.
- **The sandbox image and the open web.** As in phases 1c and 2, this session's proxy refuses
  Debian's mirrors and the open web from containers. The stack ran its launcher with
  `tbn/sandbox:test`, and the smoke test passed every check up to the one that fetches
  `https://example.com` through the egress proxy. CI builds the real image and runs all of it.
- **The image build.** npm inside `docker build` does not trust this session's proxy certificate,
  so the image was built with a local Node base image that does, passed with `--build-context`.
  The Dockerfile is the one CI builds.

## Demo

With the development stack up and the owner created, from the repository root:

```
scripts/stack_up.sh
docker compose -f docker-compose.development.yml run --rm --no-deps web \
  /app/node_modules/prisma/build/index.js migrate deploy
TBN_USERNAME=john TBN_PASSWORD="$PASSWORD" scripts/demo_phase_3.sh
```

The release step applies this phase's migration. The script checks that the stack serves the
desktop, that your account signs in, that Prometheus scrapes every process, that Grafana has the
dashboard, and makes one backup. Then it prints the steps: open `http://127.0.0.1:3000/app/`, add
a provider with your key, recruit a manager with `list_roster` set to ask first, chat with it,
assign it a task, approve its call in the inbox, read and download the report, and open Grafana
at `http://127.0.0.1:3005` as `admin` with `grafana_development_only`.

To run the flows yourself: `npm run build`, then
`E2E_DATABASE_URL=postgresql://tbn:tbn_development_only@127.0.0.1:5432/tbn_e2e npm run e2e`.

## What was done

- **Backend.** `GET /agents/:id/attachments` and the `agent_attachments` event from new triggers
  on the attachment tables; the web process serves `CLIENT_DIR` under `/app`, with immutable
  hashed assets, the page for every other path and `/` redirecting there; the worker refreshes the
  dashboard gauges every 30 seconds; `dist/admin.js backup_failed <reason>` sends the notice;
  and the realtime gateway accepts a page on its own origin, which it refused before because the
  client was never served by the stack.
- **The client.** Vite, React 19, TypeScript strict and Tailwind v4 in the `client` workspace, with
  ESLint rules for its naming and React's hooks. `lib/api` parses every answer with the contracts
  schemas and sends an `Idempotency-Key` with every command. The session lives in the tab's
  session storage, and a 401 signs out with the server's reason. `lib/realtime` connects with the
  last sequence applied and writes each change into the TanStack Query cache; streamed output
  goes to a zustand store and gives way to the stored reply. Forms check their input with the
  route's schema and put the server's rejections on the fields it names. Screens load with their
  route, so the first page stays near 400 kB.
- **Tests.** Vitest covers the API client, applying every kind of change, the load race, the
  stream store, the live connection against a fake socket, form validation and the command id of
  a resubmitted form, the formatters, the reports screen's loading, empty and error states, and
  sign in. Playwright runs the six flows from `client/e2e`.
- **Operations.** Prometheus and Grafana in both compose files, pinned by digest, with the
  provisioned data source and dashboard; `deploy/backup` with the backup and restore scripts and
  the weekly timer; the deploy workflow stages the new files and checks Grafana; the smoke test
  checks eight services, the client, the scrape targets, Grafana and one backup.
- **Delivery.** The image builds the client and sets `CLIENT_DIR`; none of the client's packages
  is installed in it. CI runs the client tests in the checks job and the flows in a new job that
  the image job waits for.
- **Docs.** `CLAUDE.md` for the client commands, layout and tests; `docs/architecture.md` with the
  phase 3 state and decisions; the runbook for Grafana, the new secret, the owner account and
  backups with a restore; the plan for the route and entity names as built; the roadmap; this
  report.

## What was decided

The decisions table in `docs/architecture.md` has the full list. These came up while building:

- **The gateway accepts its own origin.** The browser on the stack's own address was refused, as
  phase 2 only accepted listed origins or none. A page served by the same host is now accepted,
  checked by host, and a test covers both answers.
- **A change that arrives while its data loads reloads it.** TanStack Query shares a first load
  instead of restarting it, so a row inserted during a load could be missed until its next change.
  Such a load is now cancelled and run again; a test fails without it.
- **A form keeps its command id until its draft changes.** Without it, pressing the button again
  after a dropped connection sent a new id and could have recruited twice.
- **The e2e run never wipes a database.** It applies migrations and keeps one owner, `e2e_owner`;
  the flows name what they create after the run. CI's database starts empty.
- **A restore swaps databases.** `pg_restore --clean` cannot drop pg-boss's partitioned tables;
  restoring into a fresh database and renaming it keeps the old one until you drop it, and the
  first attempt, which failed inside one transaction, changed nothing.
- **Lists the server caps show their newest rows.** Approvals, sandbox jobs, notifications, merge
  requests and branch reviews come at most 200 at a time from their routes, newest first. The
  sandbox jobs screen says so, as it is the one list likely to pass the cap.
- **Two CI findings, fixed on the branch.** Semgrep's `express-res-sendfile` rule counts a string
  parameter as input, so it flagged the page sent from the client directory; it is now sent by a
  fixed name under `root`. The launcher's orphan test read a job's row as soon as its container was
  gone, before the launcher marked it lost; it now waits for the row. A two second delay in the
  launcher made the old test fail and the new one pass.
- **Grafana 13.2.2 rather than 13.2.3.** The newest release was three days old, so the image
  follows the same seven days the npm configuration asks of packages.

## Waiting for you

No objections were raised in the plan. To deploy:

1. Add `GRAFANA_ADMIN_PASSWORD` to `deploy/secrets/production.enc.env` with `sops edit`
   (runbook step 6), with the other secrets if this is the first time.
2. Run `sudo tailscale serve --bg --https=8443 http://127.0.0.1:3005` on the server for Grafana
   (step 3), and install the backup timer (step 8).
3. Merge this pull request, then dispatch the deploy with the two digests from the image jobs on
   `main` and approve it (step 9).
4. Create the owner account with `dist/admin.js owner_create` in the web container (step 9), sign in
   at `https://<machine>.<tailnet>.ts.net/app/`, and attach an integration to `backup_failed` and
   the other events on the Integrations screen.
5. Run one backup by hand and, once, a restore on the development stack or a spare machine.

Phase 4, the 3D world, waits for you to start it.
