# Phase 2 plan: realtime

## Goal

The world and the virtual desktop stop polling. Every state change the client cares about lands in
an event log in the same transaction as the change, and a Socket.IO gateway pushes it to the
owner's clients in order. A client that drops its connection reconnects with the last sequence
number it applied and receives exactly what it missed. Model output streams to the agent chat as
it is generated, and every command can carry a client-generated id so a retry after a dropped
connection never recruits or assigns twice.

## What the owner changed

The owner asked to keep testing local and to make the first production deploy once there is a
working UI, in phase 3 or 4. So this phase builds no deploy, and the two items proposed for it
because they belong with the first deploy, Prometheus with Grafana and the weekly backups, move
with the deploy. The roadmap records the move. The half of the exit that needs the server, "from
the owner's laptop on the VPN", is shown against the development stack on the owner's machine
instead, and repeats unchanged over the VPN once the stack is deployed.

## Exit criteria

1. A scripted client receives every event in order, disconnects mid-run, reconnects, and ends with
   no gap and no duplicate, checked against the log itself through `GET /events`.
2. The owner chats with a running agent: a message sent while the agent works on a task reaches its
   next turn, the reply streams in as it is generated, and the finished reply arrives as an event.
   Sending the same message twice with one command id stores it once.

`scripts/demo_phase_2.sh` runs both against the development stack with a real model. One Jest test
runs the same story against a fake provider with a real web process, worker and database.

## Design

### Where the code goes

- `modules/events/` holds the event log: its repository, the feed that turns log rows into the
  events the client receives, the Socket.IO gateway, `GET /events`, and the retention job. It reads
  the current view of each changed entity through the exported services of the other modules, so
  it depends on all of them and nothing depends on it.
- `lib/realtime/` holds the two PostgreSQL channels: the listener the web process keeps open and
  the publisher the worker uses for streamed model output. The runtime module uses the publisher
  without depending on the events module.
- `lib/idempotency/` holds the command store and the global interceptor.
- `lib/realtime_client/` holds the scripted client, used by the Jest exit test and by
  `dist/realtime_client.js`, which the demo runs.

### The event log

A database trigger writes the log, not application code, so no write path can forget it: a
repository method, a bulk `updateMany`, a raw SQL update and a cascade all leave the same trace.

- `events`: `owner_id`, `seq`, `entity`, `entity_id`, `op` (`insert`, `update`, `delete`),
  `changed` (the columns an update changed), `created_at`. The key is `(owner_id, seq)`.
- `event_heads`: one row per owner with the last sequence number given out.
- One trigger function, `tbn_record_event`, attached to each table below as a constraint trigger
  that is `DEFERRABLE INITIALLY DEFERRED`, so it runs at commit. It increments the owner's head
  with an upsert that locks that row until the commit ends, inserts the event and calls
  `pg_notify('tbn_changes', owner_id)`.
- Taking the head's lock at commit means a transaction that gets sequence 6 cannot commit before
  the one that got 5. A reader that sees 6 therefore sees 5 too: the log has no gaps in the order
  readers observe it. Because the lock is the last one a transaction takes, it cannot join a
  deadlock. A rolled back transaction writes no event and sends no notification.
- An update that changes nothing but ignored columns writes no event: `updated_at` everywhere, the
  lease columns and the guard count of a run, `idle_since` of an agent and `delegator_notified_at`
  of a task. Lease heartbeats therefore stay silent.
- The log stores no row data, only what changed. The secrets in provider, search provider,
  integration and plugin rows never leave their tables.
- Ceiling: the head row serialises the commits that change one owner's state. One owner commits a
  few hundred changes a second at most; the comment on the trigger names the limit.

| Table | Entity, id |
| --- | --- |
| `agents`, `departments`, `tasks`, `reports`, `runs`, `transcript_entries`, `approvals`, `sandbox_jobs`, `run_sources` | itself |
| `repositories`, `merge_requests`, `branch_reviews` | itself |
| `providers`, `search_providers`, `integrations`, `plugins`, `notification_channels`, `notifications`, `instructions`, `skills` | itself |
| `provider_models` | `provider`, its provider |
| `skill_attachments` | `skill`, its skill |
| `cap_windows`, `usage_records` | `cap_windows`, their provider |
| `preferences` | `preferences`, the owner |

Not in the log: owners and sessions, process instances, the caches and their counters, the queue,
and the integration and plugin attachments, which have no read route yet; phase 3 adds the route
and its trigger together.

### Delivery

The gateway sends each event with the entity's current API view, read when the event is sent: the
same shape `GET /tasks/:id` returns, so the phase 3 client writes it straight into its query cache.
A deleted entity, or one gone by the time its event is sent, carries `data: null`.

- The web process keeps one PostgreSQL connection open with `LISTEN tbn_changes` and `LISTEN
  tbn_stream`. It reconnects with backoff, and after a reconnect it delivers to every socket from
  its cursor, so a notification lost while it was away costs nothing. The web `/health` reports
  the listener.
- Socket.IO runs on the web port at `/socket.io`, with the same CORS origin list as HTTP. A client
  connects with `auth: { token, cursor }`. The token is the session token; a missing, wrong or
  expired one is refused at the handshake, and the gateway rechecks every minute so a logout or an
  expiry closes the socket.
- With a cursor, the client receives every event after it, then the live ones. Without one it
  receives `hello` with the current head and only what follows. Each socket has one delivery loop
  that reads from its last sent sequence, hydrates and sends batches of up to 200 in order; a
  notification during a send marks the socket dirty and the loop runs again. A send therefore
  never repeats or skips a sequence.
- A cursor older than the oldest event kept, or ahead of the head, gets `resync_required` with the
  head: the client reloads its state over HTTP and continues from there.
- `GET /events?after=<seq>&limit=<n>` returns the same events over HTTP, for catching up without a
  socket and for checking the socket's delivery. It answers 410 when the client must resync.
- Clients send nothing over the socket. Commands stay HTTP routes, where the auth guard,
  validation and idempotency already apply.

### Streamed model output

- Both adapters stream when the caller passes `on_text`: Anthropic Messages with `stream: true`,
  OpenAI chat completions with `stream: true` and `stream_options.include_usage`. Each assembles
  the same `ModelResponse` as today from the server-sent events, tool calls and usage included,
  and classifies an error event or a stream cut short like a failed call. Without `on_text` they
  call as today; compaction does.
- The agent's own turns pass `on_text`. The worker buffers the text and publishes a chunk every 100
  ms or 1,500 bytes with `pg_notify('tbn_stream', ...)`, well under the 8,000 byte payload limit,
  with the agent, run, turn, attempt and chunk index, and a last chunk marked `done` when the call
  ends either way.
- The gateway forwards chunks to the owner's sockets as `stream` messages. They are not in the log
  and are never replayed. A retried call starts a new attempt, so the client drops the text of the
  failed one. The finished reply arrives as the `transcript_entry` event, which replaces the
  streamed text.
- A server that sends no usage in its stream records zero tokens, as a missing `usage` does today.

### Agent chat

The chat is the agent's transcript, which already takes the owner's messages through
`POST /agents/:id/messages` and wakes the agent. With the log and streaming, the client sees the
owner's message as an event, the reply as it streams, and every tool call and result as they land.
A message to an idle agent starts a run without a task, as today; one to a busy agent joins its
next turn. No new route is needed.

### Idempotent commands

- Every authenticated `POST`, `PUT`, `PATCH` and `DELETE` accepts an `Idempotency-Key` header with
  a UUID the client generates per command. Requests without it behave as today.
- The interceptor inserts `(owner_id, key)` with a hash of the method, path and body before the
  handler runs. The first request runs; its status and body are stored when it answers with 2xx or
  4xx. A repeat with the same key and the same request gets the stored answer and the header
  `Idempotent-Replayed: true`. The same key with a different request gets 422, and a repeat while
  the first is still running gets 409.
- A 5xx answer deletes the row, so the client can retry the command.
- The store and the command's own writes are separate transactions. If the process dies between
  them, the key stays in progress and answers 409 for good rather than run the command twice; the
  client reads the result from the log.
- `@Public()` routes, login among them, ignore the header. Stored answers never hold secrets,
  because no response does.

### Retention

The worker prunes events older than `EVENT_RETENTION_DAYS` (30) and commands older than
`COMMAND_RETENTION_HOURS` (24) once an hour. A client offline for longer than the event retention
resyncs.

### The scripted client and the demo

`lib/realtime_client/` connects, applies events, keeps the cursor, collects stream chunks and can
drop and resume its connection on cue. `dist/realtime_client.js` wraps it for the demo, which
runs it inside the web container so the owner needs nothing installed. The demo adds a provider,
recruits a manager, gives it a task that takes several turns, connects the client, drops it after
a few events, sends a chat message to the busy agent twice under one command id, reconnects, and
waits for the task. It ends by comparing what the client received with `GET /events`: every
sequence once, in order, none missing.

### What waits for a later phase

- The first production deploy, Prometheus with Grafana, and the weekly backups: with the deploy,
  in phase 3 or 4.
- Read routes and events for the integration and plugin attachments of an agent: phase 3.
- Semantic event names for the world, such as an agent walking to another: phase 4 derives them
  from these change events, or adds them if deriving is not enough.

## Tasks

1. Plan, then contracts: `ChangeEventSchema`, the socket messages, `EventsQuerySchema`,
   `EventsPageSchema`.
2. The event log: Prisma models, the migration with the trigger function and the triggers, the
   events repository.
3. Delivery: the listener, the feed with hydration, the gateway, `GET /events`, the health check,
   metrics.
4. Streaming: both adapters, the fake provider server's streams, the publisher, the turn's
   `on_text`.
5. Idempotent commands: the store, the interceptor, CORS for the header.
6. Retention, the scripted client and its entry, the Jest exit story.
7. Tests: everything under "Tests required".
8. `.env.example` and compose, `CLAUDE.md`, `docs/architecture.md`, the roadmap, the demo,
   `docs/reports/phase_2.md`, the draft pull request.

## Contracts that change

### Tables

| Table | Change |
| --- | --- |
| `events` | new: `owner_id`, `seq`, `entity`, `entity_id`, `op`, `changed` null, `created_at` |
| `event_heads` | new: `owner_id`, `last_seq` |
| `commands` | new: `owner_id`, `key`, `request_hash`, `status` (`running`, `done`), `response_status` null, `response_body` null, `created_at`, `finished_at` null |

Triggers on the tables in the table above. No existing column changes.

### Schemas in `@tbn/contracts`

- New: `ChangeEventSchema`, a union on `entity` whose `data` is that entity's existing view schema
  or null; `EventOpSchema`; `EventsQuerySchema` and `EventsPageSchema`; `RealtimeHelloSchema`,
  `ResyncRequiredSchema` and `StreamChunkSchema` for the socket messages.

### Routes

| Method and path | Purpose |
| --- | --- |
| `GET /events?after=&limit=` | The log after a sequence, hydrated; 410 when the client must resync |
| `/socket.io` | Socket.IO: `hello`, `changes`, `stream`, `resync_required` |

Every authenticated mutating route also accepts `Idempotency-Key`.

### Environment

`EVENT_RETENTION_DAYS` (30) and `COMMAND_RETENTION_HOURS` (24).

## Tests required

- Event log, against PostgreSQL:
  - each evented table writes its entity and id on insert, update and delete;
  - an update of ignored columns only, such as a lease heartbeat, writes nothing;
  - a rolled back transaction writes nothing;
  - sequences per owner have no gap and follow commit order under concurrent transactions;
  - owners have separate sequences;
  - the notification arrives after the commit and not before.
- Gateway, with the web app on a port and `socket.io-client`:
  - no token, a wrong token and an expired session are refused;
  - a cursor gets exactly the events after it, then live ones, without a duplicate where they meet;
  - no cursor gets `hello` and only new events;
  - a pruned or future cursor gets `resync_required`;
  - a logout closes the socket;
  - stream chunks arrive live and are not replayed after a reconnect.
- `GET /events`: auth, the happy path, a bad cursor, and 410 after pruning.
- Adapters against the fake server's streams, for both formats: text, tool calls with their
  arguments split across chunks, usage, an error event or a cut stream, and a stream with no usage.
- Commands: a recruit and an assignment sent twice under one key run once and answer the same; the
  same key with another body gets 422; a concurrent repeat gets 409; a 5xx can be retried; keys are
  per owner; public routes ignore the header; pruning.
- Retention: old events and commands are pruned, and the cursor before them must resync.
- The exit story: a scripted client drops and resumes mid-run while the owner chats with the busy
  agent, and ends with every sequence once and in order, the streamed reply matching the stored
  one.

## Where I think the brief is wrong for this phase

1. **What an event carries.** The brief's log records each change, but a payload frozen at write
   time would need a second, row-shaped schema per entity next to its view. I send the entity's
   view as it is when the event goes out, so a replayed event shows the latest state rather than
   the state of that moment; the client's cache ends the same either way.
2. **Resuming from any point.** "Everything after it" cannot hold forever without keeping every
   event forever. I keep 30 days and answer an older cursor with `resync_required`, after which the
   client reloads its state over HTTP.
3. **The command id is optional.** Making it required would break every script and `curl` call
   that has no retry to protect. Every mutating route accepts it, and the phase 3 client sends it
   on every command.
4. **At most once over exactly once.** The command store cannot share the command's transaction
   without threading a transaction through every service. A crash between the two leaves the key
   answering 409 rather than risk a second recruit, and the log shows whether the first one landed.
