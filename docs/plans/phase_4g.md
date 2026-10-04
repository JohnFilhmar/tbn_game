# Phase 4g plan: costs and the desk

## Goal

The owner's asks after phase 4f:

1. **Token costs.** A research task by one agent used more than 400,000 tokens.
2. **Local models.** Providers other than Claude and OpenAI: Ollama, vLLM and the like.
3. **Tables and pages** on the desk instead of lists that scroll forever.
4. **Longer skill descriptions** than 300 characters.
5. **Dismissed agents** stay on the records with no way back, so they are only noise.
6. **Departments** cannot be renamed.

Plus the roadmap row for phase 4f, merged.

## Where the tokens go

Every turn sends the agent's whole session again, and on Anthropic the growing history is never
cached: only the system prompt and the tools carry a cache breakpoint. Compaction starts only at
60 percent of the context window, so on a 200,000 token model a request grows to about 120,000
tokens first. Total input therefore grows with the square of the number of turns, and 400,000 is
the sum over the task's calls, not one request. The replay cap on one tool result is a quarter of
the window, 150,000 characters on such a model, so a fetched page or a file is re-sent whole on
every later turn. A file the agent writes is re-sent too, as the input of its `write_file` call.
Usage also counts Anthropic's cache tokens twice when it prices a call, so costs read low.

## Exit criteria

1. **Caching.** Anthropic requests carry a cache breakpoint on the newest message, so each turn
   reads the history before it from the cache. Usage records count every input token once, and
   a call's cost prices cache reads and writes at their own rates on both API formats.
2. **A fixed context budget.** A preference, `context_budget_tokens` (default 60,000), compacts
   a session once a request passes it, or 60 percent of the window if that is smaller.
3. **Smaller replays.** A tool result is replayed at most 12,000 characters; a `write_file` call
   replays its path and size, not its content; `read_file` takes an offset and a length and
   returns at most 40,000 characters; `fetch_max_chars` defaults to 15,000.
4. **One task's context.** A new task starts the session from its assignment; the tasks before
   it reach the model as a short summary, not word for word.
5. **Local models.** A provider's API key is optional; a request without one sends no
   authorization header. A base URL naming one of the stack's own services is refused. The
   worker reaches the host as `host.docker.internal`. `docs/local_models.md` covers Ollama, vLLM,
   LM Studio and llama.cpp.
6. **Tables and pages.** Every desk table shows 25 rows a page with Previous and Next. The
   agents, the departments, the instructions and the decided approvals are tables.
7. **Skills.** A description takes up to 1,000 characters, with a counter in the form.
8. **Rehire.** A dismissed or ended agent can be rehired; the roster shows former agents only
   under their filter.
9. **Departments.** A department can be renamed from the desk.

## As built

- **Instructions and approval cards page as lists**, ten to a page, rather than turning into
  tables: an instruction keeps its order and its move controls, and an approval card its tool
  input and its buttons. Every other list on the desk that grows is a paged table.
- **`read_file` reads up to 5 MB of a file** and returns 40,000 characters at a time, with a note
  of how much is left and the offset that reads on, instead of refusing past 200 KB.
- **A skill description's line breaks fold into spaces**, so a pasted paragraph is taken rather
  than refused for not being one line.
- **A new task folds the earlier ones only once they pass 6,000 characters**, so a short earlier
  task costs no extra summary call.
- **Local models are entered by hand.** There is no button that lists a server's models; the
  guide in `docs/local_models.md` says what to type.

## Contracts that change

- Providers: `api_key` optional on save, `api_key_set` a boolean.
- Preferences: `context_budget_tokens`.
- Skills: description up to 1,000.
- `POST /agents/:id/rehire`; `PATCH /departments/:id` with a name.

## Tests

- **Backend:** the replay caps and the collapsed `write_file` input; the cache breakpoint on the
  newest message; usage and cost for both formats; compaction at the budget; a new task's
  context; a provider saved without a key and one naming a stack service refused; rehire and the
  department rename through supertest (auth, happy path, one rejection) and their repositories.
- **Vitest:** the table's pages; the rehire and rename controls.
- **Playwright:** rename a department; page through a table.

## Objections

- **Pages are drawn in the client, not fetched from the server.** The desk keeps each collection
  whole in the cache and live through events; paging on the server would mean rebuilding that
  for every screen. Client pages answer the scrolling; server paging can follow when a
  collection reaches thousands of rows.
- **Old tool results are not shortened as they age.** Shortening a result once it is a few turns
  old changes the start of every later request and breaks the provider's cache, which saves more
  than the shortening does. Every cap here applies the same way from the first turn.
- **A skill description is not unlimited.** Every attached skill's description is in every turn's
  system prompt; 1,000 characters keeps that bounded. The skill's body, read on demand, already
  takes 100,000.
- **Moving agents between teams waits.** A department is one manager and their interns; moving an
  intern to another manager touches running tasks and delegation. This phase renames
  departments; moving agents can be its own unit of work.
