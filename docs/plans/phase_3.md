# Phase 3 plan: web app without 3D

## Goal

The owner runs the whole company from a browser. A Vite client signs in and opens the virtual
desktop as 2D screens: every screen the brief lists, each live through the phase 2 event log, with
agent chat streaming as it is generated. The same phase makes the first production deploy
possible: Prometheus and Grafana join the stack, the weekly backups get their scripts and timer,
and the runbook covers the rest, so the owner can deploy the signed images to the server and use
the desktop over the VPN.

## What the owner decided

The roadmap left the first production deploy, with Prometheus, Grafana and the backups, to phase 3
or 4. The owner chose phase 3. The deploy itself runs on the owner's server with the owner's
secrets, so this session builds and verifies everything up to the deploy workflow, and the owner
dispatches it.

## Exit criteria

1. The owner can run the whole company from the browser: sign in, add a provider, recruit, assign,
   chat with a working agent, decide an approval, read the report, and reach every other screen of
   the virtual desktop, each with its loading, empty and error states.
2. The desktop is served by the stack, so once the owner deploys, it works over the VPN through the
   same `tailscale serve` address as the API.
3. Prometheus scrapes every process, Grafana shows the dashboards the brief names, and a weekly
   backup of the database and the workspace volume runs with a documented restore.

Playwright runs the six flows the roadmap names against a real web process, worker and database
with a fake model. `scripts/demo_phase_3.sh` brings the development stack up with the client and
prints the steps; the owner then does the same in the browser with a real key.

## Design

### Where the code goes

```
client/
  index.html, vite.config.ts (Vite and Vitest), playwright.config.ts, tsconfig.json
  src/
    main.tsx            mounts the app
    app/                router, layout of the desktop, the screen list
    providers/          one root provider file: query client, session, realtime, theme
    lib/
      api/              fetch wrapper: base URL, token, Idempotency-Key, Zod parsing, ApiError
      session/          the session token and the signed-in owner
      realtime/         the Socket.IO connection, event application, the stream store
      stores/           small Zustand stores for hot state: streaming replies
      forms/            Zod-backed form state and field errors
      format/           dates, money, tokens, statuses
    components/         shared UI: buttons, fields, dialogs, tables, badges, states
    screens/            one directory per screen, with its page-local helpers
  e2e/                  Playwright: config, global setup, fake model, the flows
```

- Vite, React 19, TypeScript strict, Tailwind v4 as the only styling, TanStack Query for server
  state, React Router for the screens, Zustand for the streaming store, `react-markdown` for
  reports. Every client package is a dev dependency of the `client` workspace, so `npm ci
  --omit=dev` keeps none of them in the backend image.
- Names follow the client rules: `camelCase` identifiers and non-component files, `PascalCase`
  components, `const [isOpen, setIsOpen]`. Payload fields are read as the backend sends them.
- Responses are parsed with the `@tbn/contracts` schemas, and forms validate with the same
  schemas the routes use.

### Serving the client

The web process serves the built client under `/app` from `CLIENT_DIR`, unset in tests and set in
the image. Hashed files under `/app/assets` get `Cache-Control: public, max-age=31536000,
immutable`; `index.html` and any other path under `/app` get the page itself with `no-cache`, so a
reload of a deep link works. `/` redirects to `/app/`. The API keeps its paths, so nothing that
already calls it changes. The static files are public, as the sign-in page must load without a
token; they hold no secret. In development, `npm run dev --workspace client` serves on port 5173
and calls the API at `VITE_API_URL`, which the development `CORS_ORIGINS` allows.

The server address is one setting, `VITE_API_URL`, empty for the same origin, so the shells of
phases 5 and 6 can point the same build at the VPN address.

### Session

Sign in posts to `/auth/login` and keeps the token in `sessionStorage`, so a reload keeps the
session and closing the tab ends it. A 401 from any call signs out and returns to the sign-in
screen with the reason. Sign out calls `/auth/logout`.

### Data and realtime

- One query per collection: `['agents']`, `['tasks']`, `['approvals']` and so on hold every row of
  the owner, and screens filter them in memory. Details that a list does not carry, such as an
  agent's transcript or a provider's usage, have their own keys.
- After sign in the client connects to the gateway with no cursor, then loads the collections; it
  keeps the last sequence it applied and reconnects with it. Each `changes` event is written
  straight into the cache: an insert or update replaces the row by id in its collection and its
  detail, a delete removes it, a transcript entry joins its agent's transcript in `seq` order, cap
  windows replace their provider's list, preferences replace the preferences. Nothing polls, and a
  change never invalidates queries. `resync_required` refetches every loaded query once, which is
  the one broad refetch, and only after a gap the log can no longer fill.
- Stream chunks go to a small store keyed by agent. The chat shows the attempt in progress, drops
  a failed attempt when the next begins, and replaces the streamed text with the stored reply when
  the agent's next assistant entry after `after_seq` arrives.
- Every command sends a new `Idempotency-Key`, and a retry of the same submission reuses it.

### Screens

Each screen is a route under `/app`, listed in a launcher on the left of the desktop, with its
loading, empty and error states designed and keyboard paths, focus states, labels and contrast in
both themes.

| Screen | Route | What it does |
| --- | --- | --- |
| Sign in | `/app/sign_in` | Username and password. |
| Roster | `/app/agents` | Every agent by department with status and current task; dismiss. |
| Recruit | `/app/agents/new` | Name, role, job description, provider, models, appearance, tool policy. |
| Agent | `/app/agents/:id` | Profile edit, tool policy, integrations and plugins attached, runs with stop and continue, and the chat: transcript, streaming reply, message box. |
| Departments | `/app/departments` | Each department with its manager and interns. |
| Task board | `/app/tasks` | Tasks by status, assign a new one, cancel; a task shows subtasks, result and report. |
| Approval inbox | `/app/approvals` | Pending calls with the input, preview and sources the run had read; approve or deny with a note. |
| Merge requests | `/app/merge_requests` | Diff, review notes, test output; merge or close. |
| Repositories | `/app/repositories` | Register empty or from a remote, refresh, delete; branch reviews. |
| Reports | `/app/reports` | Rendered Markdown, download as `.md`. |
| Providers | `/app/providers` | Add and edit providers and models, resume, usage, and the usage caps of each key. |
| Search | `/app/search_providers` | Search providers in priority order. |
| Integrations | `/app/integrations` | Request templates, test, and the notification channels and log. |
| Plugins | `/app/plugins` | MCP servers and their tools. |
| Skills | `/app/skills` | Edit, import and export `SKILL.md`, attach to roles and agents. |
| Instructions | `/app/instructions` | Global, role and agent instructions. |
| Preferences | `/app/preferences` | Every typed preference, the theme among them. |
| Cache savings | `/app/caches` | Hit rates and the tokens and money saved. |
| Sandbox jobs | `/app/sandbox_jobs` | What ran in the sandbox, with output. |

### Backend changes

- **Agent attachments.** `GET /agents/:id/attachments` returns what an agent has attached, and the
  attachment tables get the event trigger under a new entity, `agent_attachments`, whose view is
  the same `{ agent_id, integration_ids, plugin_ids }`. Phase 2 left these for this phase.
- **Static client.** `CLIENT_DIR`, the routes above, and a CSP that the built client runs under.
- **Metrics for the dashboards.** The worker refreshes gauges every 30 seconds: queue depth by
  queue and state, runs by status, spend and tokens by provider, cache hits and misses by cache,
  and the workspace volume's use. Proxy refusals already count in `tbn_egress_requests_total`.
- **Backup notice.** `dist/admin.js backup_failed <reason>` records a `backup_failed`
  notification for the owner, which the worker delivers through the owner's channels, so alerts go
  through the notification channels only.

### Monitoring and backups

- **Prometheus** scrapes `web`, `worker`, `sandbox` and `egress_proxy` on the backend network and
  keeps 30 days. It publishes no port.
- **Grafana** reads Prometheus, with the datasource and one dashboard provisioned from files:
  queue depth, run failures, spend, cache hit rate, proxy refusals and disk. Its admin password
  comes from `GRAFANA_ADMIN_PASSWORD`, a secret in the SOPS file. It publishes `127.0.0.1:3005`,
  which `tailscale serve` exposes on the tailnet next to the app. Alerting stays off.
- **Backups.** `deploy/backup/tbn_backup.sh` writes a `pg_dump` custom-format dump and a tarball
  of the workspace volume to `BACKUP_DIR`, keeps the last `BACKUP_KEEP` sets, and on failure sends
  the `backup_failed` notice. A systemd timer runs it weekly. `deploy/backup/tbn_restore.sh`
  restores one set into a stopped stack, and the runbook documents it.
- **Delivery.** Both compose files gain the two services with healthchecks, limits and restart
  policies, pinned by digest; the deploy workflow stages their files; the smoke test checks the
  scrape targets and Grafana's health and runs one backup.

### CI

The test job adds the client's typecheck, lint, Vitest and build. A new `e2e` job builds the
backend and the client, installs Chromium, and runs Playwright against PostgreSQL. The image build
compiles the client into the backend image.

### What waits for a later phase

- The 3D world, the in-world computer that opens this desktop, and semantic world events: phase 4.
- The mobile and desktop shells: phases 5 and 6.

## Tasks

1. Plan.
2. Backend: agent attachment routes and their events, static serving and CSP, dashboard metrics,
   the backup notice command.
3. Client foundation: workspace, tooling, ESLint and Prettier rules, the API client, the session,
   realtime and the cache, the desktop layout, shared components.
4. Screens, in the order the flows need them: sign in, providers and caps, recruit and roster,
   tasks, agent chat, approvals, reports; then the rest.
5. Playwright: global setup with the backend and a fake model, the six flows.
6. Monitoring and backups: Prometheus, Grafana and dashboards, backup and restore scripts, timer,
   compose, deploy workflow, smoke test.
7. CI, the image, `CLAUDE.md`, the architecture, the runbook, the roadmap, the demo, the report,
   the draft pull request.

## Contracts that change

### Tables

None new. The migration adds the event trigger to `integration_attachments` and
`plugin_attachments`.

### Schemas in `@tbn/contracts`

- `AgentAttachmentsSchema` `{ agent_id, integration_ids, plugin_ids }`, and `agent_attachments`
  in `EventEntitySchema` and `ChangeEventSchema`.

### Routes

| Route | Change |
| --- | --- |
| `GET /agents/:id/attachments` | new: the integrations and plugins attached to the agent |
| `GET /`, `GET /app/*` | new: the client, when `CLIENT_DIR` is set |

### Environment

- `CLIENT_DIR`: where the built client is, unset to serve none.
- `GRAFANA_ADMIN_PASSWORD`: a secret, in the SOPS file in production.
- Host settings for the backup script: `BACKUP_DIR`, `BACKUP_KEEP` (4).

## Tests required

- Backend, Jest:
  - the attachment routes: auth, the happy path, an unknown agent;
  - the `agent_attachments` event on attach and detach, and the trigger catalogue;
  - static serving: the page at `/app/` and at a deep link, immutable assets, the API untouched,
    nothing served without `CLIENT_DIR`;
  - the dashboard gauges after work happened;
  - the backup notice reaches the owner's `backup_failed` channel.
- Client, Vitest:
  - the API client: token, command id, schema parsing, a 401 signs out, an error body becomes an
    `ApiError`;
  - applying each kind of change event to the cache, transcript order, deletes, cap windows,
    preferences, and a resync;
  - the stream store: attempts, a failed attempt replaced, the stored reply taking over;
  - form validation from a contracts schema;
  - the formatters;
  - a screen's loading, empty and error states, and the sign-in form.
- Playwright, against a real web process, worker and database with a fake model: sign in, add
  provider, recruit, assign, approve, read report.
- Operations: the smoke test checks Prometheus's targets, Grafana's health and one backup.

## Where I think the brief is wrong for this phase

No objections. Two choices the brief leaves open are made above: the client is served by the web
process under `/app`, which keeps one image and one port and needs no new service, and the
session token lives in `sessionStorage`, which survives a reload and ends with the tab.
