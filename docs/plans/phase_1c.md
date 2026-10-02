# Phase 1c plan: the outside world

## Goal

Agents reach the open web and run code, and neither can reach the system. A manager researches a
goal through cached search and fetch, its interns write and test code in a sandbox on feature
branches of a local repository, the manager reviews and merges them and opens a merge request to
`development`, an integration call waits for the owner's approval, and a worker crash sends the
owner a notification. Everything that leaves the server goes through one proxy or through the
worker with the owner's approval.

The roadmap gates this phase: the sandbox and proxy design below needs the owner's approval before
any code. The questions to answer are listed at the end.

## Exit criteria

- A manager completes a research goal from the open web.
- Its interns write and test code in the sandbox on feature branches.
- The manager reviews and merges them and opens a merge request to `development`.
- An integration call waits for the owner's approval.
- A crash of the worker sends the owner a notification.
- Every required network, git and cache test passes.

`scripts/demo_phase_1c.sh` runs the story over HTTP against the development stack and checks each
criterion at the end. One Jest test runs the same story against fake providers.

## The sandbox and proxy design

### What has to hold

1. Agent code runs in a container with no service credentials, no docker socket, a read-only root
   filesystem, dropped capabilities, and CPU, memory and time limits.
2. That container cannot open a connection to the app, the database, the host or the VPN range.
3. Everything the sandbox and the fetch tool send out goes through one forward proxy that refuses
   private, loopback, link-local, metadata and VPN addresses after resolving the name itself, logs
   every request with the agent and run id, and enforces size and rate limits.
4. The git rules hold against a shell inside the sandbox.
5. The worker starts code in the sandbox without holding a docker socket.

### Three process types, one image

The backend image gains two process types next to `web` and `worker`:

| Service | Entry | Networks | Listens on | Holds |
| --- | --- | --- | --- | --- |
| `sandbox` | `dist/sandbox.js`, the sandbox launcher | `backend` | its ops port only (`/health`, `/metrics`) | the docker socket, `DATABASE_URL` |
| `egress_proxy` | `dist/egress_proxy.js` | `backend`, `sandbox` | 3128 inside the stack, plus its ops port | nothing |

Agent code never runs in either. It runs in short-lived containers that the launcher creates from a
second image, `tbn/sandbox`, built from `Dockerfile.sandbox`: `node:24.21.0-trixie-slim` pinned by
digest, plus `git`, `python3`, `bash`, `make`, `curl`, `jq` and `ca-certificates`, with a user
`agent` at uid 65532, the uid the worker runs as. CI builds, scans, pushes and signs both images;
the deploy workflow takes both digests.

### How the worker starts code with no docker socket

The worker never talks to Docker. It writes a `sandbox_jobs` row and sends a pg-boss job on the
`sandbox_job` queue, then polls the row once a second until it ends. The launcher works that queue
with `SANDBOX_MAX_PARALLEL` jobs at a time, so the cap on parallel sandbox runs is the queue's
concurrency and the host stays responsive. The launcher listens on nothing but its ops port: the
only way to give it work is a row in the database, which only the worker writes.

For each job the launcher creates one container through the Docker Engine API over the socket
(`lib/docker_engine/`, a small client over the unix socket, API 1.45 or newer), with:

- image `SANDBOX_IMAGE`, `User: 65532:65532`, `Init: true`, `WorkingDir: /work`,
  `Cmd: ["bash", "-lc", <command>]`, stdin closed;
- `ReadonlyRootfs: true`, `CapDrop: ["ALL"]`, `SecurityOpt: ["no-new-privileges"]`, no devices,
  not privileged;
- `NetworkMode: <project>_sandbox`, the internal network, and the proxy as the only exit:
  `HTTP_PROXY`, `HTTPS_PROXY` and `ALL_PROXY` set to `http://<run_id>:<agent_id>@egress_proxy:3128`,
  `NO_PROXY` empty; git, npm, pip and curl honour these and send the identity as
  `Proxy-Authorization`;
- mounts, all from the `workspace` volume by subpath, which is why nothing else on the volume is
  visible: the agent's checkout directory `checkouts/<owner>/<agent>` at `/work` read-write, the
  owner's shared files `owners/<owner>` at `/files` read-only, and tmpfs at `/tmp` and
  `/home/agent` sized by the job's scratch limit;
- limits from the job row, capped by the launcher's own maxima: `NanoCpus`, `Memory` with
  `MemorySwap` equal to it, `PidsLimit`, `nofile`;
- labels `com.tbn.sandbox_job`, `com.tbn.owner`, `com.tbn.run`, `com.tbn.agent`.

The launcher waits up to the job's time limit, then kills the container and marks the job
`timed_out`. After exit it reads stdout and stderr, keeps the first and last 32 KB of each, removes
the container and writes exit code, output, duration and status to the row. On boot and on every
sweep it removes containers with its label whose job is no longer running and fails jobs whose
container is gone, so a crash leaves nothing behind. Its health is `unavailable` until the socket
answers and the sandbox image is present.

One container per tool call. State an agent needs across calls, such as `node_modules`, lives in
its checkout on the volume. A container start costs about a second, which is nothing next to a
model turn, and it buys the strongest isolation available without a second runtime.

Why a launcher with the socket, and not something else:

- The worker executes tool calls that the model chose. A docker socket there would make any bug in
  a tool root on the host.
- Nested sandboxes inside one long-lived container (bubblewrap, nsjail) need unprivileged user
  namespaces, which Docker's default seccomp profile blocks inside containers and which Ubuntu
  24.04 restricts on the host with AppArmor. Allowing them means a far more privileged outer
  container. gVisor or Kata would need a runtime installed on the host and a different runbook.
- The launcher is one small process of our own code with a fixed job shape. It is on the `backend`
  network, so sandboxes cannot reach it, and its socket is the only one in the stack.

The socket is root on the host, so the launcher runs hardened like every other service, as uid
65532 with the host's docker group added (`DOCKER_GID` in the environment, read by compose), read
only, with no capabilities.

### Network layout

```
backend (bridge, has a gateway):   web, worker, postgres, searxng, sandbox (launcher), egress_proxy
sandbox (internal, no gateway):    egress_proxy, every sandbox container
```

- A sandbox container is on `sandbox` only. The network is internal, so it has no route to the
  host or the internet, and web, worker, postgres and searxng are not on it. Docker DNS resolves
  only `egress_proxy` for it.
- The proxy is on both networks: it accepts from sandboxes on `sandbox` and from the worker on
  `backend`, and reaches the internet through `backend`'s gateway. It is the one place the two
  networks touch, and it refuses every private destination, which includes both networks.
- The worker stays on `backend` only, so a sandbox can never reach its ops port. The worker's fetch
  tool reaches the proxy by its service name.
- The smoke test checks that a sandbox container reaches neither web, worker, postgres, searxng,
  its own network's gateway address nor a public address directly. If a Docker version lets an
  internal network reach the host bridge address, the compose file adds the bridge option
  `gateway_mode_ipv4: isolated`.
- No new published port carries agent traffic. The launcher and the proxy publish their ops ports
  on `127.0.0.1` like web and worker, and the compose port check covers them.

### The proxy

Our own HTTP forward proxy in `lib/egress_proxy/`, in the backend image, instead of Squid: the
rules below need resolved-address checks, per-run identity in structured logs, per-run rate
limits, byte caps on tunnels and Prometheus metrics, and that is less code to own than a Squid
configuration with helpers, and it is tested with Jest like everything else.

- It serves absolute-URI requests for `http://` targets and `CONNECT host:443` for TLS. Ports 80
  and 443 only. Nothing else is proxied.
- Every request must carry `Proxy-Authorization: Basic base64(run_id:agent_id)`; one without it is
  refused with 407. This is attribution, not authentication: only sandboxes and the worker can
  reach the proxy at all, and a hostile sandbox could present another run's id, which affects only
  logs and rate buckets.
- Address policy. The proxy resolves the host itself with every address returned. The request is
  refused when the host is an address literal in a refused range or when any resolved address is
  in one: `0.0.0.0/8`, `10.0.0.0/8`, `100.64.0.0/10` (the Tailscale range), `127.0.0.0/8`,
  `169.254.0.0/16` (which holds the cloud metadata address), `172.16.0.0/12`, `192.0.0.0/24`,
  `192.0.2.0/24`, `192.168.0.0/16`, `198.18.0.0/15`, `198.51.100.0/24`, `203.0.113.0/24`,
  `224.0.0.0/4`, `240.0.0.0/4`; and for IPv6 `::`, `::1`, `::ffff:0:0/96` (checked as its IPv4),
  `64:ff9b::/96`, `fc00::/7`, `fe80::/10`, `fd7a:115c:a1e0::/48` (Tailscale) and `2001:db8::/32`.
  It then connects to the vetted address, never to the name again, so a name that answers
  differently the second time gains nothing.
- Optional allowlist: `EGRESS_ALLOWED_HOSTS`, a comma list of host suffixes. Empty, the default,
  allows every public host, as the brief says.
- Limits: `EGRESS_MAX_RESPONSE_BYTES` (10 MB) per response and per tunnel, counted from upstream;
  `EGRESS_MAX_REQUESTS_PER_MINUTE` (120) per run id; a connect timeout of 10 s and an idle timeout
  of 60 s; `EGRESS_MAX_CONNECTIONS` (256) in total.
- Plain-HTTP requests whose path ends in `git-receive-pack` are refused: that is a git push. HTTPS
  is a tunnel the proxy cannot read; see the git section.
- Every request is one JSON log line: run id, agent id, method, host, port, resolved address,
  decision and reason, status, bytes each way, duration. Metrics: requests by decision and reason,
  bytes, open tunnels.

### The git rules, enforced against a shell

The rules are enforced by what the sandbox can see, not by hooks the sandbox could edit.

- The canonical repository of each registered repository is a bare repository on the workspace
  volume at `repos/<owner>/<repo>.git`. No agent container ever mounts it. Its only remote is the
  public URL the owner registered, with `pushurl` set to an invalid address, and no credential
  exists anywhere in the stack, so it can be fetched and never pushed.
- An agent works in its own full clone at `checkouts/<owner>/<agent>/<repo>`, made with
  `git clone --no-hardlinks` so no object file is shared with the canonical repository, and with no
  remote. A shell in the sandbox sees this directory and the read-only `/files`, nothing else: the
  canonical repository and every other agent's checkout are outside the mount.
- Every operation on a canonical repository is a system job: the launcher runs the sandbox image
  with the canonical repository mounted at `/repo`, the agent's checkout at `/work` read-only when
  the operation reads it, and a fixed script, `deploy/sandbox/git_job.sh`, baked into the image.
  The script takes one operation and validated arguments; agent text such as a commit message
  travels in an environment variable, never in the command line. Operations: `init`,
  `clone_remote`, `fetch_remote`, `checkout` (clone into the agent checkout and create or switch
  the branch), `publish`, `diff`, `log`, `merge_feature`, `merge_request_diff`,
  `merge_to_development`.
- `publish` is the only way a branch reaches the canonical repository: the job runs
  `git fetch /work <branch>:refs/heads/<branch>` for the branches the worker allows, fast-forward
  only, no tags. The worker computes the allowed set from the agent: an intern may publish only the
  feature branch of a task assigned to it, a manager only its manager branch. `development`,
  `staging` and the default branch are in no agent's set; the owner's merge route is the only
  writer, and only from an open merge request.
- Branch names: a manager named `alice` owns `alice/main`, and its interns' feature branches are
  `alice/<task_slug>`, where the slug is the task title with a short id suffix. Git cannot hold a
  branch `alice` next to `alice/<slug>`, which is the first objection below.
- Reading public remotes: `fetch_remote` runs with the proxy as its only exit, like every sandbox
  job. Registering a repository with a remote clones it the same way.
- A push from a shell: the checkout has no remote, the canonical repository is not mounted, and
  there is no credential. An agent can add a remote and push through the proxy only to a server
  that accepts anonymous pushes over HTTPS, which the proxy cannot inspect; the host allowlist
  closes that for owners who want it. This is the second objection.

### Settings and limits

Per run, from preferences: `sandbox_timeout_seconds` (600), `sandbox_cpus` (1.0),
`sandbox_memory_mb` (1024), `sandbox_scratch_mb` (512, the tmpfs sizes). The launcher caps them
with `SANDBOX_MAX_CPUS`, `SANDBOX_MAX_MEMORY_MB` and `SANDBOX_MAX_SCRATCH_MB` from the environment,
and runs `SANDBOX_MAX_PARALLEL` (2) jobs at a time. Docker cannot put a quota on a volume subpath,
so the disk limit applies to scratch space, and the checkout grows with the repository; the
sweep's disk alert covers the volume. This is the third objection.

## Design of the rest

### Where the code goes

- `lib/docker_engine/`, `lib/sandbox_launcher/` and `lib/egress_proxy/` are infrastructure with
  their own entries `sandbox.ts` and `egress_proxy.ts`; `ProcessTypeSchema` gains `sandbox` and
  `egress_proxy`, and `healthcheck.ts` probes them.
- `RuntimeModule` gains search, fetch and the caches, the research library, sandbox jobs, the git
  tools and taint. `CompanyModule` gains repositories, merge requests, branch reviews and approvals.
  `KnowledgeModule` gains plugins. `IntegrationsModule` gains integrations, notification channels
  and the notification log; it depends on the queue and crypto only, so company and runtime may
  depend on it. The direction from 1b stays otherwise.
- The tool registry becomes per agent: the built-ins plus one tool per attached integration and
  one per tool of each attached plugin.

### Search, fetch, caches and the library

- `search_providers`: type `brave` or `searxng`, name, base URL, sealed key, priority, enabled, and
  an optional price per thousand requests for the savings figure. `owner_create` seeds the stack's
  SearXNG at `SEARXNG_URL` when the variable is set. Two adapters behind one interface: Brave's web
  search API and SearXNG's JSON format, both returning title, URL and snippet.
- `web_search(query, max_results)` answers from `search_cache` when the normalised query is inside
  `search_cache_ttl_minutes`, otherwise asks providers in priority order and skips one that errors,
  times out, answers 429 or 402, or has no quota, and stores the result under the provider that
  answered.
- `fetch_url(url, fresh)` goes through the proxy with the run's identity, accepts HTML, plain
  text, JSON, XML and Markdown up to `FETCH_MAX_BYTES` (2 MB) raw, extracts text (scripts and
  styles dropped, block elements as line breaks, entities decoded, whitespace collapsed) up to
  `fetch_max_chars`, and stores it in `fetch_cache` by URL without its fragment for
  `fetch_cache_ttl_minutes`. `fresh: true` refetches. The tool never returns a raw response.
- `search_library(query)` runs a PostgreSQL full-text search over cached pages and reports, with a
  generated `tsvector` column and a GIN index on each, and returns titles, references and excerpts.
  The standing instructions tell agents to use it before `web_search`.
- Hits and misses are counted in `cache_events`. `GET /caches/stats` returns hit rates, requests
  and bytes saved, and money saved from the providers' prices.
- Cached content is web content: a hit taints the run exactly as a fresh fetch does.

### Taint and the approval inbox

- `runs.tainted_at` and `run_sources` (kind `fetch`, `search`, `library` or `plugin`, the
  reference, whether it came from a cache, when). Reading any of them taints the run.
- Outward tools are integrations and plugins. A tool whose policy is `ask`, and every outward tool
  in a tainted run whatever its policy, creates an `approvals` row of kind `tool_call` with the
  exact input, a preview of the request with the token redacted, and the run's sources, and the
  run pauses with the new reason `awaiting_approval`; its task moves to `awaiting_approval` with the
  reason. The tool result is written when the owner decides: approved, the worker runs the tool and
  continues; denied, the model reads "The owner denied this call" with the owner's note.
- The runaway guard now also creates an approval, of kind `runaway_guard`. `POST /approvals/:id/
  approve` and `/deny` decide both kinds; the 1b routes `POST /runs/:id/continue` and `/stop` keep
  working and decide the open approval. The 1a `ask` answer to the model goes away.
- The `approval_waiting` notification fires when an approval is created.

### Integrations and notification channels

- `integrations`: name, method, URL template, header templates, a sealed optional token with
  `token_set` in responses, body format `json`, `form`, `text` or `none`, body template, and the
  declared placeholders with a description and whether each is required. Saving rejects a
  `{{name}}` that is not declared, other than `{{token}}`, and a placeholder name outside
  `[a-z][a-z0-9_]*`.
- Rendering is plain replacement with escaping for the format: JSON string escaping in `json`
  bodies, percent encoding in `form` bodies and URLs, raw in `text`, and CR and LF stripped from
  headers. No expressions, no code.
- `POST /integrations/:id/test` sends a call with sample values and returns the status and an
  excerpt. Calls run from the worker with a timeout, direct, not through the proxy: the URL is the
  owner's, not an agent's.
- Agent tools: `integration_attachments` gives an agent a tool `call_<integration>` whose input is
  the declared placeholders, default policy `ask`. The agent sees the status and a 2 KB excerpt,
  never a header.
- Notification channels: `notification_channels` binds an event type to an integration with an
  optional body override. Event types, each with documented placeholders and a default body:
  `process_restarted`, `runs_resumed`, `run_failed`, `cap_threshold_passed`,
  `provider_out_of_credit`, `backup_failed` (reserved for phase 2, nothing emits it yet),
  `disk_nearly_full`, `approval_waiting`, `report_finished`. Every event provides `{{event}}`,
  `{{priority}}`, `{{title}}`, `{{message}}` and `{{time}}`. `GET /notification_events` lists the
  catalogue.
- Sending: `NotificationService.emit` writes `notifications` rows and a `notify` queue job; the
  worker sends with three attempts and records the outcome. The web process emits through the same
  queue. A cap threshold notifies once per crossing, out of credit once per marking, and the sweep
  checks the workspace volume and notifies once when it passes `disk_alert_percent` (90).
- Restart detection: each process writes a `process_instances` row at boot and marks it stopped on
  a clean shutdown. A process that finds unstopped rows of its own type at boot stopped uncleanly
  and emits `process_restarted` itself, then closes them. The worker emits `runs_resumed` with the
  count when its first sweep after boot re-wakes orphaned runs.

### Plugins

- `plugins`: name, URL, sealed token, enabled; `plugin_attachments` per agent. Transport: MCP over
  streamable HTTP with the official `@modelcontextprotocol/sdk` client and a bearer token.
- At the first turn of a run the worker lists each attached plugin's tools and offers them as
  `plugin_<plugin>__<tool>` with the server's input schema; an unreachable plugin contributes no
  tools and a system note. Default policy `ask`; results are text, size-capped, and taint the run.
  Credentials stay in the worker. `POST /plugins/:id/tools` shows the owner the list.

### Git, reviews and merge requests

- `repositories`: name, optional public remote URL (`http` or `https`), default branch. `POST`
  initialises an empty canonical repository with the default branch and `development`, or clones
  the remote. `POST /repositories/:id/fetch` fetches the remote again.
- Tools, all through the worker and system jobs, none through a shell: `git_checkout(repository)`
  prepares the agent's checkout on its branch, an intern's task feature branch created from
  `development`, a manager's `<name>/main`, or for a manager a feature branch of its department to
  review; `git_publish` sends the agent's branch to the canonical repository; `git_diff` and
  `git_log` read; `run_command(command, cwd)` is the shell, in the checkout, for building,
  testing and committing. `review_branch(branch, findings, verdict, test_job)` records a
  `branch_reviews` row with the head commit it reviewed. `merge_feature_branch(branch)` merges a
  department feature branch into the manager branch only when its latest review approves that head
  and the named test job on it exited 0. `open_merge_request(notes, test_job)` opens a
  `merge_requests` row from the manager branch into `development` with the diff, the log, the
  review notes and the test output.
- `GET /merge_requests`, `GET /merge_requests/:id`, `POST /merge_requests/:id/merge` (the owner;
  the system job merges into `development`) and `POST /merge_requests/:id/close`.
- The event log arrives in phase 2; until then reviews and merge requests are rows, which the
  event log will mirror. This is the fourth objection.

### What waits for a later phase

- Dashboards for proxy refusals, cache hit rate and sandbox usage, and backups: phase 2, with the
  metrics already exposed now.
- The approval screen, the merge request screen and the cache savings screen: phase 3. The API
  returns everything they show.
- The event log and the world's events for reviews, merges, sandbox runs and approvals: phase 2.

## Tasks

1. Contracts, Prisma schema and migration for every table below.
2. The sandbox: `Dockerfile.sandbox`, the Docker Engine client, the launcher process, sandbox
   jobs, `run_command`, the compose services, the stack script that builds both images, the CI
   image job for two images and the deploy workflow's second digest.
3. The proxy process, the address policy, the fetch tool through it, the smoke test's network
   checks.
4. Search providers and adapters, the caches, the library, cache stats.
5. Repositories, system git jobs, checkouts, the git tools, reviews, merge requests and the owner's
   merge route.
6. Taint, approvals and the inbox routes, the runaway guard through the inbox.
7. Integrations, notification channels, the notification log, restart detection, the disk check,
   plugins.
8. Tests: everything under "Tests required".
9. `.env.example` and compose additions, `CLAUDE.md`, `docs/architecture.md`, `docs/server_setup.md`
   (Docker 26 or newer, the docker group id), the demo script, `docs/reports/phase_1c.md`, the
   draft pull request.

## Contracts that change

### Tables

| Table | Change |
| --- | --- |
| `process_instances` | new: `process_type`, `instance_id`, `started_at`, `stopped_at` null |
| `sandbox_jobs` | new: `owner_id`, `run_id` null, `agent_id` null, `kind` (`agent`, `system`), `command` or `operation` and `arguments`, mounts, limits, `status` (`queued`, `running`, `done`, `failed`, `timed_out`, `lost`), `exit_code`, `stdout`, `stderr`, `started_at`, `finished_at` |
| `search_providers` | new: `type`, `name`, `base_url`, `api_key_ciphertext` null, `priority`, `enabled`, `price_per_thousand_requests` null |
| `search_cache`, `fetch_cache` | new, with a generated `tsvector` column and a GIN index on `fetch_cache` and on `reports` |
| `cache_events` | new: `kind`, `day`, `hits`, `misses`, `bytes_saved` |
| `runs` | add `tainted_at` null; `pause_reason` gains `awaiting_approval` |
| `run_sources` | new: `run_id`, `kind`, `reference`, `cached`, `read_at` |
| `approvals` | new: `run_id`, `agent_id`, `task_id` null, `kind`, `tool_name` null, `tool_use_id` null, `payload`, `preview`, `sources`, `status`, `note` null, `decided_at` null |
| `integrations`, `integration_attachments`, `notification_channels`, `notifications` | new |
| `plugins`, `plugin_attachments` | new |
| `repositories`, `merge_requests`, `branch_reviews` | new |
| `tasks` | add `repository_id` null, `feature_branch` null |

### Schemas in `@tbn/contracts`

- `ProcessTypeSchema` adds `sandbox` and `egress_proxy`.
- New: `SandboxJobSchema`, `SearchProviderSchema`, `SearchResultSchema`, `CacheStatsSchema`,
  `ApprovalSchema`, `IntegrationSchema`, `NotificationEventTypeSchema`,
  `NotificationChannelSchema`, `NotificationSchema`, `PluginSchema`, `RepositorySchema`,
  `MergeRequestSchema`, `BranchReviewSchema`, `RunSourceSchema`, each with its create and update
  schemas derived by `.pick()` and `.partial()`, and the write-only `api_key` and `token` added with
  `.extend()` with `api_key_set` and `token_set` in responses.
- `RunSchema` adds `tainted_at`; `TaskSchema` adds `repository_id` and `feature_branch`.
- `PreferencesSchema` adds the keys below.

### Routes

| Method and path | Purpose |
| --- | --- |
| `GET,POST /search_providers`, `PATCH,DELETE /search_providers/:id` | Search providers |
| `GET /caches/stats` | Hit rates and savings |
| `GET /approvals`, `GET /approvals/:id`, `POST /approvals/:id/approve`, `POST /approvals/:id/deny` | The approval inbox |
| `GET,POST /integrations`, `GET,PATCH,DELETE /integrations/:id`, `POST /integrations/:id/test` | Integrations |
| `POST,DELETE /agents/:id/integrations/:integration_id` | Attach an integration as a tool |
| `GET /notification_events` | The event catalogue with placeholders and default bodies |
| `GET,POST /notification_channels`, `PATCH,DELETE /notification_channels/:id` | Channels |
| `GET /notifications` | The notification log |
| `GET,POST /plugins`, `GET,PATCH,DELETE /plugins/:id`, `POST /plugins/:id/tools` | Plugins |
| `POST,DELETE /agents/:id/plugins/:plugin_id` | Attach a plugin |
| `GET,POST /repositories`, `GET,DELETE /repositories/:id`, `POST /repositories/:id/fetch` | Repositories |
| `GET /merge_requests`, `GET /merge_requests/:id`, `POST /merge_requests/:id/merge`, `POST /merge_requests/:id/close` | Merge requests |
| `GET /sandbox_jobs`, `GET /sandbox_jobs/:id` | Sandbox jobs with their output |
| `GET /runs/:id/sources` | What a run read |

### Preferences

| Key | Default |
| --- | --- |
| `sandbox_timeout_seconds` | 600 |
| `sandbox_cpus` | 1 |
| `sandbox_memory_mb` | 1024 |
| `sandbox_scratch_mb` | 512 |
| `search_cache_ttl_minutes` | 1440 |
| `fetch_cache_ttl_minutes` | 1440 |
| `fetch_max_chars` | 40000 |
| `disk_alert_percent` | 90 |

### Environment

| Variable | Default | Process |
| --- | --- | --- |
| `SANDBOX_PORT`, `EGRESS_PROXY_OPS_PORT` | 3002, 3003 | ops ports |
| `DOCKER_SOCKET` | `/var/run/docker.sock` | launcher |
| `DOCKER_GID` | 999 | compose, the launcher's extra group |
| `SANDBOX_IMAGE`, `SANDBOX_NETWORK`, `WORKSPACE_VOLUME` | set by compose | launcher |
| `SANDBOX_MAX_PARALLEL`, `SANDBOX_MAX_CPUS`, `SANDBOX_MAX_MEMORY_MB`, `SANDBOX_MAX_SCRATCH_MB` | 2, 2, 2048, 1024 | launcher |
| `SANDBOX_OUTPUT_MAX_BYTES` | 65536 | launcher |
| `EGRESS_PROXY_PORT` | 3128 | proxy |
| `EGRESS_PROXY_URL` | `http://egress_proxy:3128` | worker |
| `EGRESS_ALLOWED_HOSTS` | empty | proxy |
| `EGRESS_MAX_RESPONSE_BYTES`, `EGRESS_MAX_REQUESTS_PER_MINUTE`, `EGRESS_MAX_CONNECTIONS` | 10485760, 120, 256 | proxy |
| `FETCH_MAX_BYTES` | 2097152 | worker |
| `INTEGRATION_TIMEOUT_MS` | 15000 | worker |
| `SEARXNG_URL` | `http://searxng:8080` in compose | `owner_create` |

## Tests required

All against a real PostgreSQL with fake providers. The sandbox and proxy tests need Docker, which
the CI checks job and this session have; they build the sandbox image once and create their own
network, and they fail, never skip, without Docker.

Required by the roadmap:

- Runtime: a tainted run cannot call an outward tool without approval, even with policy `auto`;
  the owner's approval runs it and a denial answers the model; a saved integration token never
  appears in a response, a log, a model request or a sandbox environment.
- Git, each through the real launcher and sandbox image:
  - an intern cannot write to a manager branch: `git_publish` refuses it, and from a shell the
    manager's checkout and the canonical repository do not exist;
  - no agent can write to `development`, `staging` or the default branch: `git_publish` refuses
    them for interns and managers, and only the owner's merge route changes `development`;
  - no agent can push to a remote: the canonical repository refuses pushes, the checkout has no
    remote, and a shell that adds one and pushes through the proxy is refused on plain HTTP and
    has no credential for HTTPS;
  - each of these holds from a shell inside the sandbox.
- Cache: a repeated search and a repeated fetch inside the lifetime make no outbound request;
  search falls back to the backup provider when the primary fails; a cached page still taints the
  run.
- Integrations: placeholders are escaped so a value cannot break out of the body format in `json`,
  `form` and URLs; an unknown placeholder is rejected when the owner saves the template.
- Network:
  - the proxy refuses private, loopback, metadata and VPN addresses, including through a public
    name that resolves to one (a fake resolver in the unit test, a name that resolves to
    `127.0.0.1` in the integration test), and allows a public address;
  - the sandbox cannot reach the app or the database: a sandbox job cannot connect to web,
    worker, postgres, searxng or its gateway, and reaches a public address only through the proxy.

Also:

- the exit story in one test: research with cached search and fetch, an intern's feature branch
  built and tested in the sandbox, review, merge, a merge request the owner merges, an integration
  call that waits for approval, one report;
- the launcher: limits applied, a job timed out and killed, output capped, orphans removed at boot,
  the parallel cap;
- the proxy: identity required, size and rate limits, `git-receive-pack` refused, logs carry run
  and agent ids;
- notifications: every event type renders its default body with its placeholders, a channel
  override is used, a failed send is retried and recorded, a crashed worker sends
  `process_restarted` on its next boot (the real worker process killed with SIGKILL, as in 1a);
- plugins: tools of a fake MCP server appear in the agent's tool list, a call taints the run and
  needs approval, an unreachable plugin contributes nothing;
- the library finds a cached page and a report and its hits taint the run;
- every new route gets auth, the happy path and a rejection, and every new repository method an
  integration test with owner scoping.

## Where I think the brief is wrong for this phase

1. **Manager branch names.** The brief names a manager's branch after the manager and its interns'
   branches `<manager_name>/<task_slug>`, and git cannot hold a branch `alice` next to
   `alice/<slug>`. I build `alice/main` for the manager and `alice/<task_slug>` for its interns,
   so the manager's name is the namespace of its department's branches.
2. **"No agent can push to a remote" from a shell.** Credentials are the real control and the stack
   holds none, but a shell can still push anonymously through the proxy to a server that accepts
   that, which the proxy cannot see inside TLS. I build the proxy's host allowlist as an optional
   setting, empty by default as the brief's "public addresses" asks, and recommend you set it.
3. **Disk limits per sandbox run.** Docker cannot put a quota on a subpath of a volume, so the disk
   limit can only bound the scratch tmpfs, and a checkout grows with its repository. I build the
   scratch limit and the volume alert and leave checkouts unbounded.
4. **Reviews as events.** The brief records a review as an event with its findings, and the event
   log arrives in phase 2. I build reviews and merge requests as rows now, and phase 2 mirrors them
   into the event log.
5. **A tainted run and the sandbox.** The brief lists integrations and plugins as the tools that act
   outside the server, yet a tainted run can also send data out through the sandbox's proxy
   access. I build the brief's rule and no extra approval for sandbox runs; if you want that exit
   closed, say so and tainted runs will get sandbox jobs with no network.

## What needs your approval before coding

- The sandbox launcher as a third process type that holds the docker socket, creating one hardened
  container per tool call, with the worker and the sandboxes holding no socket.
- The proxy as our own process in the backend image rather than Squid.
- The network layout: two networks, the proxy on both, sandboxes on the internal one only.
- The branch naming in objection 1 and the allowlist default in objection 2.
- Whether tainted runs keep sandbox network access, objection 5.
