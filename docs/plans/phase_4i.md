# Phase 4i plan: guests

## Goal

Friends visit the owner's company in real time. The owner sends a friend a link; the friend picks a
guest name and walks the same world, sees the owner and the other guests move, reads the desk
without changing anything, talks with idle agents through a small local model, and messages the
owner and the other guests. Voice chat comes later.

The owner's asks, as decided after the council of 2026-10-06:

1. **Invite links, one per friend.** A short-lived link gets the friend past the domain gate and
   signs them in as a guest. They pick a guest name once. The guest session lasts 30 days; after
   that the owner sends a new link for the same friend.
2. **Read-only desk.** A guest sees the desk screens but cannot create, change or delete anything.
3. **Talk with idle agents.** A guest talks only with an agent that is idle. While an agent works
   on a task, only the owner can talk with it; guests see what it does. A guest's conversation always
   runs on the guest model the owner picks, a small model served by llama.cpp on the server, with
   context on what the company is doing. No token or spend limit applies to guests.
4. **A shared world in real time.** Guests and the owner see each other move. Guests live in the
   owner's room: when the owner changes the environment, guests go with them. Guests cannot build.
   An unstuck key puts anyone back at the spawn point.
5. **Player messages.** Approaching another player opens a dialog to message them. The recipient
   gets a pop up; clicking it teleports them beside the sender with the same dialog open. Either can
   leave and come back through their pending messages. A player who leaves stays in the world for
   20 minutes, idling and wandering like an agent and shown offline in the dialog, then walks out
   of the building.

## Exit criteria

1. The owner creates an invite on the desk's Guests screen and copies its link once. The link
   expires after 24 hours if unused; the owner can revoke an invite or a guest.
2. Opening the link signs the friend in as a guest and asks for a guest name, unique among the
   owner's guests and different from the owner's username. A revoked guest, an expired session or a
   used invite gets no access.
3. Without the owner's gate password or a guest session, the domain answers nothing but
   `/invite/<token>`.
4. A guest can call every read route except those that carry connection settings (providers,
   integrations, plugins, search providers, notification channels), and no write route except the
   guest routes. The desk hides or disables its write controls for a guest.
5. A guest's message to an idle agent gets a reply from the guest model, with no tools, written to
   the guest's own conversation and never to the agent's transcript. A message to a busy agent is
   refused with the reason.
6. Every player sees every other player in the world move within a fraction of a second, with
   their name above them; positions are never written to the database.
7. A player message reaches only its two players. The recipient sees a pop up; clicking it
   teleports them beside the sender with the dialog open. Unread messages wait in a list.
8. A player who disconnects stays 20 minutes, wandering and shown offline, then walks to the exit
   and leaves.
9. Guests cannot open build mode, change the environment, or change prop state. `U` puts the
   player back at the spawn point.
10. The guest model runs on llama.cpp on the server, reached by the worker over the `llm_gateway`
    network.

## Design

- **Principals.** The owner keeps the Bearer session. A guest has a `tbn_guest` cookie
  (HttpOnly, Secure, SameSite=Lax, 30 days) holding a random token whose hash is a
  `guest_sessions` row. The auth guard accepts either; for a guest it sets `request.owner` to the
  host owner, so read controllers work unchanged, and `request.guest` to the guest.
- **Route policy.** A guest may call `GET` routes unless the handler or controller is marked
  `@OwnerOnly()`, and other methods only when marked `@GuestAllowed()`. Writes are refused by
  default, so a new route is safe for guests until someone opts it in.
- **The gate.** nginx asks the web process `GET /gate` through `auth_request` for every request
  without the owner's gate cookie; it answers 204 for a live guest session. The owner's basic auth
  moves to `/gate/owner`, the only place that sets the owner gate cookie, so a guest cannot obtain
  it. `/invite/` is open and rate limited.
- **Guest chat** is its own table, `guest_chat_messages`, per guest and agent. A message queues a
  `guest_reply` job; the worker builds a prompt from the agent's role and job description, a digest
  of the company (each agent's status and current task, the recent finished tasks with their
  results) and the conversation so far, then calls the guest model with no tools and no run. Usage
  is recorded with no run.
- **Presence** is socket traffic only. A client sends its position a few times a second; the web
  process keeps each owner's players in memory, relays positions to the others, and remembers a
  disconnected player for 20 minutes.
- **Player messages** are rows in `player_messages`, in the event log like every other change; the
  gateway delivers each one only to the sockets of its two players.
- **Guest model** is the `guest_model` preference: a provider and a model the owner picks on the
  Guests screen.

## Contracts that change

- `packages/contracts`: `Guest`, `GuestInvite` (create body, created view with the link),
  `GuestChatMessage`, `PlayerMessage`, `Principal` (`/auth/me` answers owner or guest), presence
  socket messages (`presence` both ways, `players`, `player_left`), the `guest_model` preference, and
  the event entities `guest`, `guest_chat_message`, `player_message`.
- Socket: clients send `presence`; the server sends `players`, `presence` and `player_left`.

## Tests

- **Backend:** invite create, redeem, expiry, reuse and revoke; the gate; the route policy for a
  guest (a read, an owner-only read, a refused write, an allowed write); the guest name rules; a
  guest reply on an idle agent through the fake provider with no tools and no transcript entry; the
  refusal on a busy agent; player messages delivered to their two players only; presence relayed
  between two sockets and a player kept after disconnect.
- **Vitest:** the guest desk without write controls; remote players and the 20 minute linger; the
  message pop up teleporting beside the sender; the unstuck key; build mode hidden for a guest.
- **Playwright:** a guest redeems an invite, names themselves, reads the desk without write
  controls, and messages the owner, who sees the pop up.

## Objections

- **Guests talking to agents.** Guest text is untrusted, and the agents hold real tools. It stays
  safe only because a guest's conversation never reaches the agent's transcript or its tools; the
  guest talks to the agent's persona on the guest model, which cannot act.
- **No limit on guest prompts.** The limit that matters on a CPU is time, not memory: the model
  reads every prompt token before it answers. Guests get a digest of what the company is doing
  rather than an agent's whole transcript, so replies take seconds; there is no cap on messages.
- **Guests read the desk.** Transcripts, reports, files and approvals become readable by friends.
  Connection settings stay owner-only, since a webhook address or a plugin header works as a secret.
- **Presence lives in one web process.** A second web process would split the players in two;
  the comment at the presence store names that ceiling.

## As built

- **The gate** became two locations instead of one basic-auth realm: `/gate/owner` sets the owner
  cookie after the password, and every other request goes through `auth_request`. A test caught
  that `return` in that location ran before the password check and handed the cookie to anyone;
  it answers from the content phase now.
- **The guest cookie** is `Secure` whenever the visit came over HTTPS, as it always does through
  nginx; a plain HTTP visit, such as the end-to-end run, keeps it without.
- **Player messages and presence** live in the identity and events modules: identity owns the
  players (the owner, the guests and their messages), events owns the gateway.
- **An offline player** is walked by an agent actor, so they wander the same spots as idle agents
  until the server says they are gone, then leave through the exit.
- **A guest's own character** looks the way their id picks; the owner's look stays a preference.
- **The model** is served by llama.cpp in `/opt/llama_cpp`, reached by the worker through
  `docker-compose.vps.yml` on the box's `llm_gateway` network.

