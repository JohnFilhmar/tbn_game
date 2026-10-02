# Phase 1c report: the outside world

## Outcome

Phase 1c meets its exit criteria in Jest, with the real sandbox launcher creating containers
through the Docker Engine, the real egress proxy, a real worker and a real database. The web, the
search engine and the ticket desk are fakes on the loopback interface, so every test runs without
an account anywhere.

- **The story.** `phase_1c_story.spec.ts` runs the exit story end to end. A manager searches the
  library and finds nothing, searches the web, searches again and gets the cache, reads a page
  and reads it again from the cache, checks out its branch, delegates a note to a new intern that
  commits on its feature branch in the sandbox and publishes, checks out the intern's branch, runs
  the test there, approves the branch with that test job, merges it, opens a merge request to
  `development`, and calls the ticket desk. That call stops in the inbox with the four sources
  the run had read; nothing reaches the ticket desk until the owner approves. The manager then
  reports, the owner merges the merge request, and `git show development:pelican.txt` in the
  canonical repository holds the intern's line.
- **The restart.** `restart_notification.spec.ts` kills the real worker process with SIGKILL and
  checks that the next worker sends `process_restarted` through the owner's channel.
- **Required tests.** Each one the roadmap lists exists and passes:

  | Required test | Where |
  | --- | --- |
  | A tainted run cannot call an outward tool without approval | `outward_taint.spec.ts`, `plugins.spec.ts` |
  | A saved integration token never appears in a response or a log | `integration.controller.spec.ts`, `outward_taint.spec.ts` (requests, transcript, sandbox environment) |
  | An intern cannot write to a manager branch | `git_flow.spec.ts` |
  | No agent can write to `development`, `staging` or the default branch | `git_flow.spec.ts` |
  | No agent can push to a remote | `git_flow.spec.ts`: the checkout has no remote and `git push` fails from a shell in the sandbox |
  | Each of these holds from a shell inside the sandbox | `git_flow.spec.ts`: the intern's shell sees only its checkout, no `/repo`, and `publish` is a system job that checks the branch list |
  | A repeated search and a repeated fetch inside the lifetime make no outbound request | `web_tools.spec.ts`, `phase_1c_story.spec.ts` (one request each at the fake search engine and the fake web) |
  | Search falls back to the backup provider when the primary fails | `web_tools.spec.ts` |
  | A cached page still taints the run | `web_tools.spec.ts`, `prisma_web_cache.repository.spec.ts` |
  | Placeholders are escaped so a value cannot break out of the body format | `template_renderer.spec.ts` |
  | An unknown placeholder is rejected when the owner saves the template | `integration.controller.spec.ts` |
  | The proxy refuses private, loopback, metadata and VPN addresses, including through a public name that resolves to one | `address_policy.spec.ts`, `egress_proxy.spec.ts` (`private.test` resolves to `10.0.0.1`) |
  | The sandbox cannot reach the app or the database | `sandbox_launcher.spec.ts` (a host port, the worker, the database and the internet), `scripts/smoke_test_stack.sh` (the service addresses) |

- **Tests.** 343 Jest tests in 69 files, 155 of them new in this phase. Every
  new repository method has an integration test, and every new route a supertest test for auth,
  the happy path and a rejection.
- **Pull request and CI.** The draft pull request and its CI run are recorded below once CI has
  run.

## What could not be run here

- **The sandbox image.** The session's network proxy refuses Debian's package mirrors, so
  `Dockerfile.sandbox` could not be built here. Every sandbox test ran against a substitute image
  built from `node:24.21.0-trixie` with the same user id, the same `git_job.sh` and the same
  tools, under the name `tbn/sandbox:test`. CI builds the real image for the test job and the
  image job, and the compose smoke test runs the stack with it.
- **The development stack and the demo.** With no sandbox image, neither `scripts/stack_up.sh` nor
  `scripts/smoke_test_stack.sh` ran here, and `scripts/demo_phase_1c.sh` needs a model. The
  Jest story is the verified path; the demo script follows it step by step over HTTP.

## Demo

With Docker 28 or later and the compose plugin, from the repository root:

```
scripts/stack_up.sh
printf '%s' "$PASSWORD" | docker compose -f docker-compose.development.yml run --rm -T web \
  dist/admin.js owner_create john
TBN_USERNAME=john TBN_PASSWORD="$PASSWORD" \
  ANTHROPIC_API_KEY=sk-ant-... ANTHROPIC_MODEL=claude-sonnet-4-5 \
  ANTHROPIC_CHEAP_MODEL=claude-haiku-4-5 \
  scripts/demo_phase_1c.sh
```

`scripts/stack_up.sh` builds the sandbox image and brings the seven services up healthy. Creating
the owner also seeds the stack's SearXNG as a search provider; set `BRAVE_API_KEY` to put Brave
Search ahead of it. The script registers a repository, adds a ticket integration and a
`process_restarted` channel that both post to `TBN_WEBHOOK_URL` (`https://httpbin.org/post`
unless set), recruits a manager with the integration attached, and assigns one goal in seven
explicit steps. It prints each subtask and its branch, approves the ticket call when it reaches
the inbox, prints what the run read and the cache statistics, merges the open merge request as the
owner, saves the report in `demo_reports/`, kills the worker with SIGKILL and waits for the
restart notification, and ends with six checks. Set `TBN_SKIP_KILL=1` on a machine without the
docker CLI.

## What was done

- **The sandbox.** A third process type, `sandbox`, is the only one holding the docker socket. It
  polls `sandbox_jobs` rows and creates one container per job through the Engine API: the sandbox
  image, read-only root, no capabilities, `no-new-privileges`, the worker's uid, cpu, memory,
  pids and time limits, a scratch tmpfs with a size limit, the agent's checkout and files mounted
  by subpath of the one workspace volume, and either the isolated sandbox network or none. It
  caps the output, removes the containers a crash left behind, runs at most the configured number
  of jobs at a time, and serves `/health` with the engine, image and network checks. The
  `run_command` tool runs in the agent's checkout with `HTTPS_PROXY` set to the proxy and nothing
  else from the worker's environment. `Dockerfile.sandbox` is the second image: Debian with bash,
  git, curl, jq, make, Node and Python, and the git job script.
- **The egress proxy.** A fourth process type in the backend image. Every request carries a run
  identity or an owner identity, or gets 407. It forwards plain HTTP and tunnels HTTPS on ports 80
  and 443 only, resolves the host first and refuses private, loopback, link-local, metadata, CGNAT
  and VPN ranges and their IPv6 forms, single-label and reserved names, and `git-receive-pack`.
  It caps each response, limits requests per run per minute and connections in flight, honours
  an optional host allowlist, and logs each request with its identity, with counters on its ops
  port.
- **Search, fetch, caches and the library.** Search providers in priority order, Brave Search and
  SearXNG, with the stack's SearXNG seeded when the owner is created. `web_search` tries them in
  order and caches each query for the owner's lifetime. `fetch_url` goes through the proxy,
  follows up to five redirects, keeps text types, extracts readable text, and caches each page.
  `search_library` searches the cached pages and the reports with PostgreSQL full text search.
  Cache events count hits, misses and bytes per day for `GET /caches/stats`. The system prompt
  tells agents to search the library before the web.
- **Git.** Repositories as canonical bare copies under the workspace, empty with `development`
  and the default branch, or mirrored from a remote through the proxy and refreshed on request.
  Each agent has its own checkout with no remote, on `<manager>/main` for a manager and
  `<manager>/<task slug>-<suffix>` for an intern. Every git operation is a job in the sandbox
  running the fixed `git_job.sh`, which re-checks the branch rules it is told. Tools:
  `git_checkout`, `git_publish`, `git_log`, `git_diff`, `review_branch`, `merge_feature_branch`
  and `open_merge_request`. A merge needs an approving review of the current commit whose test
  job exited 0. The owner merges or closes merge requests and deletes repositories over HTTP.
- **Taint and approvals.** Every search, fetch, library hit and plugin call is a run source and
  taints the run. The tool executor plans every call of a turn first: a call under policy `ask`,
  or an outward call in a tainted run, goes to the inbox with its payload, a redacted preview
  and the sources, and nothing in the turn runs until every call is decided. The runaway guard
  goes to the same inbox. `approve` resumes the run; `deny` answers the model with the owner's
  note.
- **Integrations, notifications and plugins.** Integrations with a sealed token, a template per
  body format with escaping that keeps a value inside its format, placeholders checked when the
  template is saved, a test route, and attachment to agents as `call_<slug>` tools. Nine
  notification events with placeholders and default bodies, channels per event with an optional
  body override, a log, and delivery by the worker with retries. Each process writes an instance
  row on boot and marks it stopped on shutdown; a worker that boots and finds unstopped rows sends
  `process_restarted`. The sweep checks the workspace volume for `disk_nearly_full`, cap crossings
  send `cap_threshold_passed`, and `provider_out_of_credit`, `report_finished`, `approval_waiting`,
  `runs_resumed` and `run_failed` fire where their names say. Plugins are MCP servers over
  streamable HTTP with a bearer token; their tools appear as `plugin_<name>__<tool>` and are called
  from the worker, which keeps the token.
- **Routes.** Fourteen groups of routes behind the guard, listed in `docs/plans/phase_1c.md`.
- **Compose, CI and deploy.** Both compose files run `sandbox` with the docker socket and
  `egress_proxy` on two networks, the sandbox one internal with the isolated gateway. CI builds the
  sandbox image for the test job, brings the stack up with `scripts/stack_up.sh` for the smoke
  test, which now checks the network walls, and builds, scans, signs and attests both images.
  The deploy workflow takes both digests.
- **Docs.** `CLAUDE.md` for the process types, the Docker needs of the tests and the rules on
  taint, git and the proxy; `docs/architecture.md` with the phase 1c state, the two networks, new
  ceilings and the decisions; `docs/server_setup.md` for Docker 28, the docker group and the two
  digests; the roadmap status; this report.

## What was decided

The decisions table in `docs/architecture.md` has the full list. These came up while building and
verifying the phase:

- **An `internal` network was not enough.** A container on a Docker `internal` network could still
  reach a port bound on the host's bridge address. The sandbox network sets the isolated gateway
  mode, which needs Docker 28, and the launcher test checks a port bound on the host.
- **A merge into a manager branch nobody published.** A manager that delegates before it publishes
  has no branch in the canonical repository, so the first merge failed on a missing ref while its
  intern had branched from `development`. The merge now creates the manager branch at
  `development` first. The story test covers it.
- **The test suite ran out of memory.** With `--experimental-vm-modules`, Jest keeps every test
  file's module graph alive, about 50 MB per file, and the in-band run reached the 2 GB heap
  limit at the sixtieth file. The files now run one at a time in one child worker that is recycled
  past 1 GB.
- **The disk figure.** The first check divided used blocks by all blocks, which counts the
  reserved blocks nobody can use and reads higher than `df`. It now reports what `df` reports.
- **Approvals moved to the runtime module.** The plan put the rows in the company module; every
  reader and writer is the run loop, so the module boundary would have been crossed on every call.
- **Trivy on the sandbox image.** The first scan found a fixable `libpcre2` CVE in the Debian
  base and four in the dependencies npm bundles. The image now upgrades its Debian packages at
  build time and pins npm 12.1.0, which carries the `ip-address` and `tar` fixes. No released npm
  carries the `brace-expansion` and `undici` fixes yet, so `.trivyignore` lists those three CVEs
  with an expiry six weeks out; each is a denial of service of one sandbox job at most.
- **The objections in the plan.** All five were approved as proposed: `<manager>/main` branch
  names, the empty host allowlist by default, disk limits on the scratch space only, reviews and
  merge requests as rows until the event log, and sandbox network access for tainted runs.
