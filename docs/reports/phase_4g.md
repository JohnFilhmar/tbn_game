# Phase 4g report: costs and the desk

## Outcome

**Tokens.** The 400,000 tokens of the research task were not one request: every turn sent the
whole session again, none of the history was cached on Anthropic, and sessions grew to 60
percent of the model's window before they were summarised. Now:

- Anthropic requests carry a cache breakpoint on the newest message, so each turn reads the
  history before it from the cache, billed at the cache read price.
- A session is summarised once a request passes the `context_budget_tokens` preference, 60,000
  by default (Preferences, Run limits), or 60 percent of the window if that is smaller.
- A new task starts from its assignment; the tasks before it become a short summary.
- A tool result is replayed at most 12,000 characters, a `write_file` call replays its path and
  size instead of the file, `read_file` returns 40,000 characters at a time, and a fetched page
  is cut at 15,000 characters by default.
- Usage counts cached input once on both API formats, so a call's cost now prices Anthropic's
  cache reads and writes correctly. Anthropic costs read low before.

**Local models.** A provider's key is optional, and one without a key sends no authorization
header. The worker reaches the host as `host.docker.internal`. A base URL naming one of the
stack's own services is refused. `docs/local_models.md` covers Ollama, vLLM, LM Studio and
llama.cpp: the address to use, the context size each needs, and tool calling.

**The desk.**

- Every table shows 25 rows a page with Previous and Next; approval cards and instructions page
  ten at a time.
- The agents are one table; former agents show under their filter with a Rehire button, also on
  the agent's own page. An intern comes back only under a live manager.
- The departments are a table with a Rename dialog.
- A skill's description takes 1,000 characters, with a counter. Its body already took 100,000.

## What was checked here

- **Backend tests**, against a throwaway PostgreSQL container: the run loop, compaction, team,
  pauses, delegation, report, provider client, transcript, provider routes, company, knowledge
  and events suites pass. New checks cover:
  - the cache breakpoint on the newest block only;
  - usage and cost on both formats;
  - the `write_file` replay and the tool result cap;
  - a new task folding the earlier ones;
  - the `read_file` window;
  - a provider without a key, and base URLs naming `postgres` or `prometheus` refused;
  - rehire, including the intern refused under a dismissed manager;
  - the department rename through its route and its repository.
- **Vitest.** The table's pages, a department renamed from its row, and a former agent rehired
  from the agents table pass. A full run had four screen tests (conversation, reports, sign in)
  time out on their first render under load; each passes run alone, as before.
- **Static checks.** Typecheck, ESLint and Prettier are clean.
- **Playwright on CI**: a new flow renames the e2e manager's department and names it back.

Not measured here: the token saving on a real research task. The next one shows it in the
report's usage lines and the provider's usage panel.

## What changed from the plan

The plan records five changes under "As built". The one that matters most: instructions and
approval cards page as lists rather than tables, to keep their move controls and buttons.

## Waiting for you

- Run a research task like the 400,000 token one and compare its usage; if a long task now loses
  track of earlier work, raise the context budget in Preferences.
- After merging, update the stack and apply the migration (the API key column becomes optional):
  `scripts/stack_up.sh`, then
  `docker compose -f docker-compose.development.yml run --rm --no-deps web /app/node_modules/prisma/build/index.js migrate deploy`.
- To try a local model, follow `docs/local_models.md`.
