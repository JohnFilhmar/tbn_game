# Roadmap

Each phase ends with a demo the owner can run and a written report in
`docs/reports/phase_<n>.md`. A phase starts only when the owner opens a session and names it, with
this kickoff message:

```
Read CLAUDE.md, docs/architecture.md, docs/roadmap.md and the last phase report.
Start phase <n>, for example 1a. Write docs/plans/phase_<n>.md first, then build to the exit criteria.
```

## Status

| Phase | Name | Status |
| --- | --- | --- |
| 0 | Foundations | Merged |
| 1a | One agent, one task | Merged |
| 1b | The team | Merged |
| 1c | The outside world | Merged |
| 2 | Realtime | Merged |
| 3 | Web app without 3D | Merged |
| 4 | The 3D world | Merged |
| 4b | Game feel | Merged |
| 4c | Living agents | In progress |
| 4d | Build mode and themes | Planned |
| 4e | Interactive objects | Planned |
| 5 | Mobile | Not started |
| 6 | Desktop | Not started |
| 7 | Online readiness | Not scheduled. A written design only. |

## Phase 0, foundations

Repository layout, `CLAUDE.md`, the monolith with empty modules and both process types, health
endpoints, compose for development, CI with every gate, `.env.example`, `docs/architecture.md`,
`docs/roadmap.md`, `docs/server_setup.md`.

Exit: one command brings the stack up healthy, CI is green on the draft pull request, and the
deploy workflow is documented and waits only on the owner's server and secrets.

## Phase 1, the company over REST

Three sessions, each with its own plan and exit.

### Phase 1a, one agent, one task

- Owner login.
- Providers with both adapters and encrypted keys.
- Managers and departments.
- Instructions, skills and preferences.
- Tasks, durable checkpointed runs, usage counting per key, prompt caching, the file tools, reports.

Exit: using only HTTP calls, the owner adds two providers, recruits two level 1 agents on different
providers, assigns each a writing task, and downloads both reports. Killing the worker mid-run
loses nothing.

Required tests:
- a worker killed mid-run resumes from its checkpoint;
- a saved API key never appears in a response or a log.

Notes for this phase:
- Introduce `pg-boss` with its schema created by a migration, not on boot.
- Add the global auth guard while keeping `/health` and `/metrics` public.
- Add the Zod validation pipe.

### Phase 1b, the team

- Roster, messages and delegation tools.
- Intern spawn, reuse inside the department, and idle termination.
- Cap windows, the local fallback rule and the runaway guard.
- Condensed reports.

Exit: the owner assigns one goal and sees a manager:
1. spawn interns;
2. reuse an idle one;
3. switch new interns to the local provider after a cap threshold;
4. terminate an idle one after the timeout;
5. return one condensed report.

Required tests:
- a window with enforcement off never changes behaviour;
- an enforced window past its threshold stops intern spawns on that key and sends new interns to
  the local provider;
- a blocked manager resumes when the window resets;
- rolling and fixed windows reset at the right time;
- an idle intern is reused before a spawn;
- a manager cannot use another department's intern;
- an intern is terminated after the idle timeout;
- the runaway guard pauses a looping run.

### Phase 1c, the outside world

- The sandbox, the egress proxy, and web search with fallback.
- Fetch, the search and fetch caches, and the research library.
- Local git with the branch rules and merge requests.
- Integrations, notification channels and plugins.
- Taint and the approval inbox.

The plan for this phase must contain the sandbox and proxy design: how the worker starts code in
the sandbox with no docker socket, the network layout, and the proxy rules. Stop after writing that
plan and wait for the owner's approval before coding. Phase 0 left `sandbox` and `egress_proxy` as
idle placeholders on an internal network for this phase to replace.

Exit:
- a manager completes a research goal from the open web;
- its interns write and test code in the sandbox on feature branches;
- the manager reviews and merges them and opens a merge request to `development`;
- an integration call waits for the owner's approval;
- a crash of the worker sends the owner a notification;
- every required network, git and cache test passes.

Required tests:
- Runtime: a tainted run cannot call an outward tool without approval, and a saved integration
  token never appears in a response or a log.
- Git:
  - an intern cannot write to a manager branch;
  - no agent can write to `development`, `staging` or the default branch;
  - no agent can push to a remote;
  - each of these holds from a shell inside the sandbox.
- Cache:
  - a repeated search and a repeated fetch inside the lifetime make no outbound request;
  - search falls back to the backup provider when the primary fails;
  - a cached page still taints the run.
- Integrations: placeholders are escaped so a value cannot break out of the body format, and an
  unknown placeholder is rejected when the owner saves the template.
- Network:
  - the proxy refuses private, loopback, metadata and VPN addresses, including through a public
    name that resolves to one;
  - the sandbox cannot reach the app or the database.

## Phase 2, realtime

- Event log, Socket.IO gateway and cursor resume.
- Streamed agent chat and idempotent commands.
- First production deploy on the server behind the VPN.

Exit: a scripted client receives every event in order, disconnects mid-run, reconnects, and ends
with no gap and no duplicate. From the owner's laptop on the VPN, the owner can chat with a
running agent.

The owner moved the first production deploy to phase 3 or 4, once there is a working UI, and the
two items below go with it. Until then phase 2 shows the chat against the development stack on the
owner's machine, with `scripts/demo_phase_2.sh`.

Also proposed for this phase, because no phase names them and they belong with the first
production deploy:
- Prometheus and Grafana inside the VPN, with dashboards for queue depth, run failures, spend,
  cache hit rate, proxy refusals and disk;
- weekly PostgreSQL and workspace volume backups with a documented restore command and a
  configurable destination.

## Phase 3, web app without 3D

The Vite client, sign in, and the full virtual desktop as 2D screens. The first production deploy,
with Prometheus, Grafana and the backups, lands here or in phase 4, as the owner decides. The owner
chose this phase.

Exit: the owner can run the whole company from the browser over the VPN.

Required tests: Vitest for client logic. Playwright in `e2e/` for:
- sign in;
- add provider;
- recruit;
- assign;
- approve;
- read report.

## Phase 4, the 3D world

- The three environment packs and the asset manifest, with its contract in `docs/assets.md`.
- The owner's character with third person controls, and NPCs driven by the event stream.
- The camera toggle and character customisation.
- Time of day, including the real clock mode.
- The in-world computer that opens the phase 3 screens.

Exit: when the owner assigns a task, the right agent walks, works, hands off and returns, and
interns arrive and leave. This holds in both camera modes and all three environments, at 60 frames
per second on a mid-range laptop.

## Phase 4b, game feel

The owner asked for this after phase 4: the app should feel like one game, not a dashboard with
a 3D lobby.

- Sign in on the owner's desk monitor, in first person; after sign in the same monitor shows the
  desk.
- The desk, sign in and HUD in the world's low poly look: palette, faceted corners, fonts.
- Leaving the desk glides the camera back to the owner's camera mode; sitting down glides it in,
  from the computer or from anywhere through a short teleport.
- A teleport to every agent.

Exit: the owner signs in at the monitor, works at the desk, stands up into the world, jumps to an
agent and sits back down, all with no hard cut; a reloaded desk screen lands seated; every phase 3
and phase 4 flow still passes.

Required tests: a reloaded desk screen lands seated; signing in lands on the desk; an expired
session signs in again at the monitor and returns to the screen; a teleport to an agent.

## Phase 4c, living agents

Idle agents wander to spots in the room and play animations there, and the owner talks to any
agent in the world through an over the shoulder camera and a side panel with its live session.
Plan: `docs/plans/phase_4c.md`.

## Phase 4d, build mode and themes

The owner places, moves, recolours and removes every prop and picks a theme. Each environment's
layout and theme are kept in the database. Plan: `docs/plans/phase_4d.md`.

## Phase 4e, interactive objects

A whiteboard that keeps its drawing, a coffee set, a water dispenser, blinds, a light switch panel
and a patch of grass, usable by the owner and the agents, each placeable in build mode. Plan:
`docs/plans/phase_4e.md`.

## Phase 5, mobile

Measure the client on a real phone first and report the frame rate. Then build the Capacitor
shell, touch controls, and notifications for approvals and finished reports.

Exit: the phase 4 demo passes on a real Android or iOS device connected to the VPN.

## Phase 6, desktop

Tauri shell for Windows, macOS and Linux with installers built in CI.

Exit: installers for all three systems run the phase 4 demo.

## Phase 7, online readiness

Not scheduled. A written design only: public exposure, refresh token rotation, rate limiting,
accounts, shared worlds, and what splitting the monolith would take.
