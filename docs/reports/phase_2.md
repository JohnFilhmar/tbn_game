# Phase 2 report: realtime

## Outcome

Phase 2 meets its exit criteria in Jest, with a real web process, a real worker and a real
database, and again against the development stack on this machine. In both the model is a fake
that streams in the provider's own format, so nothing needed an account anywhere. The first
production deploy, and with it the chat from the owner's laptop on the VPN, moved to phase 3 or 4
at the owner's request.

- **The story.** `phase_2_story.spec.ts` runs the exit criteria end to end. The owner reads the
  head of the log, assigns a manager a task of six turns that each stream text, and the scripted
  client connects from that cursor. It drops its connection once the agent has replied twice,
  sends the owner's message to the busy agent twice under one `Idempotency-Key`, stays away while
  the run goes on, and reconnects from where it stopped. When the task is done it catches up with
  the head and sets what it received against `GET /events`: every sequence once and in order, no
  gap, no duplicate, no resync. The message was answered 201 twice, the second time replayed,
  and is in the transcript once; the agent replied both before and after it, and a later model
  request carried it. Every streamed reply the client saw whole equals the transcript entry
  stored for it. The test passed five runs out of five.
- **The demo against the stack.** `scripts/demo_phase_2.sh` ran against the development stack
  built from this branch, with a fake streaming model on the host. The client ran from the web
  image and printed:

  ```
  Connected: the log's head is 52, delivery starts after 47
  Received 8 events and 3 stream chunks, dropping the connection at 55
  Sent the message twice under one command id: 201 then 201, the second replayed
  Reconnected from 55, the log's head is now 61
  The task ended as done
  Events received: 31 after 47, up to 78; the log holds 31
    every sequence once and in order: yes
    missing: none; repeated: none
  Connections: 2, resyncs: 0
  Message sent twice under one command id: 201 then 201, second replayed: yes, same entry: yes, stored 1 time(s)
  Streamed replies: 2 complete with text, 2 equal their stored entries
  Task: done
  Exit criteria met
  ```

  The transcript after the owner's message shows the agent taking the note into each later part.
- **Required tests.** Each one the plan lists exists and passes:

  | Required test | Where |
  | --- | --- |
  | Each evented table writes its entity and id on insert, update and delete | `prisma_event.repository.spec.ts`: the catalog check on all 25 triggers and their arguments, and an insert, update and delete in order |
  | An update of ignored columns only writes nothing | `prisma_event.repository.spec.ts` (a lease heartbeat) |
  | A rolled back transaction writes nothing; owners have separate sequences | `prisma_event.repository.spec.ts` |
  | Sequences have no gap and follow commit order under concurrent transactions | `prisma_event.repository.spec.ts` (24 concurrent transactions, read while they commit) |
  | The notification arrives after the commit and not before | `prisma_event.repository.spec.ts` |
  | The gateway refuses no token, a wrong token and an expired session | `realtime_gateway.spec.ts` |
  | A cursor gets exactly what follows, then live events, with no duplicate where they meet | `realtime_gateway.spec.ts` (30 writes racing the connect), `phase_2_story.spec.ts` |
  | No cursor gets `hello` and only new events | `realtime_gateway.spec.ts` |
  | A pruned or future cursor gets `resync_required` | `realtime_gateway.spec.ts` |
  | A logout closes the socket | `realtime_gateway.spec.ts` |
  | Stream chunks arrive live and are not replayed | `realtime_gateway.spec.ts` |
  | `GET /events`: auth, the happy path, a bad cursor, 410 after pruning | `event.controller.spec.ts`, `retention.service.spec.ts` |
  | Both adapters against streams: text, split tool arguments, usage, a failed stream, no usage | `provider_client.service.spec.ts`, `sse.spec.ts` |
  | Commands: recruit and assign twice run once, 422, 409, a 5xx retried, per owner, public routes, pruning | `idempotency.interceptor.spec.ts`, `command_store.spec.ts` |
  | Retention prunes events and commands, and the cursor before them must resync | `retention.service.spec.ts` |
  | The exit story | `phase_2_story.spec.ts` |

- **Tests.** 403 Jest tests in 80 files, 60 of them new in this phase. Every new repository
  method has an integration test, and the new route a supertest test for auth, the happy path and
  a rejection.
- **CI is green on the draft pull request**,
  [JohnFilhmar/tbn_game#8](https://github.com/JohnFilhmar/tbn_game/pull/8), on every push of this
  phase. In [run 37062352099](https://github.com/JohnFilhmar/tbn_game/actions/runs/37062352099),
  on the commit that added this report, the test job ran the whole suite, the compose job brought
  the six services up and passed the smoke test with the real sandbox image, and the image jobs
  pushed
  `ghcr.io/johnfilhmar/tbn_game/backend@sha256:dd7fecf311b40575dfefe0586495f2bc3bb94d81ab12735de73d9a9b7b6d216b`
  and
  `ghcr.io/johnfilhmar/tbn_game/sandbox@sha256:ec2ac786db2991798d731fe7fd133234e39fa48342c8e0877a1c3a3794c45852`,
  signed both with cosign under the pull request identity and attested their SBOMs.

## What could not be run here

- **The sandbox image.** As in phase 1c, this session's network proxy refuses Debian's package
  mirrors, so the stack ran its launcher with the substitute `tbn/sandbox:test` image. The smoke
  test passed every check but its last, which starts the real image by name. Phase 2 does not
  touch the sandbox; CI builds the real image and runs the smoke test with it.
- **The backend image.** npm inside `docker build` does not trust the session proxy's
  certificate, so the image was built here with a local copy of the Node base image that does,
  passed with `--build-context`. The Dockerfile is unchanged.
- **A real model.** The demo ran against a fake Anthropic server that streams three words at a
  time at about a model's pace. A first run with a fake that finished all five turns in three
  seconds failed the stream check: the whole run fell inside the client's three seconds away, so
  no reply streamed while it was connected. That is the check doing its job; a real model's turns
  outlast the drop.
- **The VPN.** The deploy moved to phase 3 or 4, so the chat ran against the development stack.

## Demo

With the development stack up, from the repository root:

```
scripts/stack_up.sh
docker compose -f docker-compose.development.yml run --rm --no-deps web \
  /app/node_modules/prisma/build/index.js migrate deploy
TBN_USERNAME=john TBN_PASSWORD="$PASSWORD" \
  ANTHROPIC_API_KEY=sk-ant-... ANTHROPIC_MODEL=claude-sonnet-4-5 \
  scripts/demo_phase_2.sh
```

The release step applies this phase's migration. On a fresh database, create the owner once
between the two, as `CLAUDE.md` shows.

The script adds the provider, recruits a manager, reads the head of the event log and assigns a
task of five turns. It then runs `dist/realtime_client.js` in a one-off container from the web
image, with the session token on stdin, so the host needs only docker, curl and jq. The client
drops after the agent's first reply, sends the owner's note twice under one command id, comes back
three seconds later, waits for the task, prints the checks above and exits non-zero when one
fails. The script ends with the agent's transcript from the owner's message on.

## What was done

- **The event log.** Migration `20261002180000_realtime` adds `events`, `event_heads` and
  `commands`, the trigger function and a deferred constraint trigger on each of the 25 tables
  behind the API. At commit each changed row appends an event under the owner's next sequence:
  the entity, its id, the operation and, for an update, the fields that changed. Columns nobody
  shows, such as lease timestamps and heartbeats, change nothing, and a part, such as a cap
  window, a provider model or a skill attachment, is an update of its parent. The owner's head row
  is locked last, so sequences become visible in commit order with no gap, and the trigger sends
  `NOTIFY tbn_changes` with the owner's id.
- **Delivery.** The web process listens on its own connection, reconnects with backoff and
  reports `event_listener` in `/health`. The Socket.IO gateway at `/socket.io` takes the session
  token and a cursor in the handshake, answers `hello` with the head, and sends each socket the
  events after its cursor in order, 200 at a time, with the entity's current view from its own
  module's service; an entity that is gone goes out as `null`. A cursor ahead of the head or
  before the oldest event gets `resync_required`. Sessions are checked every minute and a socket
  whose session ended is closed. `GET /events?after=&limit=` reads the same log and answers 410
  for a cursor that was pruned. Four metrics count connections, events sent, stream chunks and
  resyncs.
- **Streaming.** Both adapters ask for a stream when the caller wants text as it comes, parse the
  server-sent events and assemble the same answer as before, usage included; a stream that fails
  partway is retried like any failed call. The turn service publishes each agent call's text on
  `tbn_stream`, at most 1,000 bytes per notice, gathered for 100 ms, with the call's id, its
  attempt and the transcript entry the reply will follow, and closes the stream before the reply
  is stored. The gateway forwards chunks to the owner's sockets and never stores them.
- **Idempotent commands.** A global interceptor makes every authenticated `POST`, `PUT`, `PATCH`
  and `DELETE` idempotent on an optional `Idempotency-Key` UUID: the first request claims the key
  with a hash of the method, the URL and the body with its keys sorted, a 2xx or 4xx answer is
  stored and replayed with `Idempotent-Replayed: true`, a different request under the key gets
  422, a repeat while it runs gets 409, and a 5xx frees the key. CORS allows the header and
  exposes the replay flag.
- **Retention.** `EVENT_RETENTION_DAYS` and `COMMAND_RETENTION_HOURS`, both 0 by default, which
  keeps everything. Set, the worker prunes once an hour.
- **The scripted client.** `lib/realtime_client` holds the Socket.IO client that applies events in
  order and records any gap or duplicate, and the scripted session of the exit criteria that the
  story test and `dist/realtime_client.js` both run.
- **Docs.** `CLAUDE.md` for the trigger rule on new tables, the command id header and the test
  notes; `docs/architecture.md` with the phase 2 state, three new ceilings and the decisions; the
  roadmap status; `.env.example` and both compose files for the retention settings; this report.

## What was decided

The decisions table in `docs/architecture.md` has the full list. These came up while building:

- **A call id on every stream chunk.** A run that pauses after a failed call resumes with a new
  call after the same transcript entry, with its attempts counted from 1 again, so the chunks of
  the two could not be told apart. Each call now has its own id.
- **The client drops after the agent's replies, not after a number of events.** The backlog a
  resuming client receives at once could reach any event count before the run had started, so the
  owner's message arrived before the agent's first reply rather than mid-run.
- **The stream closes before the reply is stored.** A client sees the last chunk of a call before
  the transcript entry that replaces it.
- **Retention is off unless the owner sets it.** See the second objection below.
- **One HTTP helper became two files.** The adapters' shared HTTP code grew past the file rule
  with streaming and was split into `adapters/http/post.ts` and `adapters/http/failures.ts`.
- **Test files no longer inherit notifications.** A full local run failed once: a notification
  waited 27 seconds behind retries of `process_restarted` notices to the dead webhooks of earlier
  runs, which the local test database keeps, and the notify worker takes about one job a second.
  `reset_worker_state` now clears queued notifications and disables the channels earlier files
  left, as it already dismissed their agents. CI starts from an empty database and never saw it.

## Waiting for the owner

The plan stated four objections, and the rule is to build what the brief says until the owner
answers. Here is how each was built:

1. **What an event carries.** The brief says each change is appended to the log in the same
   transaction, and that is what the log holds; it does not say what an event sends. An event
   goes out with the entity's view as it is when sent, as proposed. A copy frozen at write time
   would need a row-shaped schema for every entity next to its view.
2. **Resuming from any point.** Built as the brief says: nothing is pruned, so every cursor gets
   everything after it. The proposed 30 days of events and 24 hours of command ids are one
   setting each, `EVENT_RETENTION_DAYS=30` and `COMMAND_RETENTION_HOURS=24`, if you approve them.
3. **The command id is optional.** The brief says every command accepts one, and every mutating
   route does; requests without it behave as before.
4. **At most once.** The brief asks that a retry cannot recruit or assign twice, and it cannot. A
   process that dies between claiming a key and storing the answer leaves that key answering 409;
   the log shows whether the command landed.
