# Phase 4i report: guests

## Outcome

Friends can visit the company at `https://tbn-game.filhmar.online`.

**Getting in.** On the desk's Guests screen you create a link for a friend and copy it; it is shown
once, works once, for 24 hours, and signs them in as a guest for 30 days. On arrival they pick the
name everyone sees. A friend coming back later gets a new link from their row; Revoke shuts a guest
out within seconds. Without your password or a guest session, the domain answers nothing but the
invite links, which are rate limited.

**What a guest can do.**

- Walk the world with you and the other guests in real time, names over every head. Guests always
  live in your room: when you change the environment, they go with you.
- Read every desk screen except the connection settings (providers, search, integrations, plugins,
  notification channels) and the Guests screen. Every button that would change something is off
  for them, and the server refuses their writes anyway.
- Talk with an idle agent. While an agent works on a task, only you can talk with it; guests see
  what it does. A guest's conversation runs on the guest model, with no tools, and never reaches the
  agent's own transcript or work.
- Message you or another guest: walk up and press E, or click them. The recipient gets a pop up;
  clicking it takes them beside the sender with the conversation open, and the Messages list keeps
  unread threads to come back to.
- Press U to get back to the entrance when stuck.

- Use the room's props like you do: the blinds, the lights, the radio, the whiteboard, the plants,
  the sofa and the coffee. Everyone sees them sit, drink or press where they are.

A guest cannot build, change the room or the world menu (the clock included), travel to another
place, customise anyone, or add to your grass counter.

**Leaving.** A player who closes the page stays in the world for 20 minutes, wandering like an idle
agent and shown offline, then walks out of the building.

**The guest model** is `techwithsergiu/Qwen3.5-text-0.8B-GGUF:Q4_K_M`, served by llama.cpp in
`/opt/llama_cpp` on the box under the id `qwen3.5-0.8b`, capped at 3 cores and 2 GB. Each guest
conversation reads a digest of the company (who is working on what, the recent finished tasks and
their results), not an agent's transcript, which keeps replies to seconds on a CPU. There is no cap
on guest messages.

## What was checked here

- **Backend tests** against a throwaway PostgreSQL: invites (create, follow, reuse, expiry,
  revoke), the gate, the guest route policy, guest names, guest chat on an idle and a busy agent
  through the fake provider (no tools, no transcript entry, usage with no run), player messages
  reaching only their two players, presence relayed between real sockets, and a player kept and
  then gone after they leave. The identity, guest chat and events suites pass: 13 suites, 52 tests.
- **Vitest**: the guest desk with its write controls off and the owner screens hidden, the Guests
  screen, a remote body following poses and walking out, a message pop up opening its
  conversation, the unstuck key, and a new guest naming themselves without build mode. 130 of 132
  pass in a full run; the two that time out under load (reports, sign in) pass alone, as before.
- **The nginx gate**, against nginx 1.24 with a stand-in web process: the owner password, the
  owner cookie, good and bad guest cookies, invite links, the rate limit, websockets, and a guest
  sending a made-up password. This caught a real hole: a `return` in the owner's sign-in location
  ran before the password check and handed the owner cookie to anyone. It answers after the check
  now.
- **Static checks**: typecheck, ESLint and Prettier on everything this phase changed; shellcheck
  on `scripts/vps_up.sh`.
- **Playwright on CI**: a guest follows an invite, names themselves, reads the desk without the
  owner's screens, and messages the owner, who opens the pop up.
- **The dependency scan** fails on main since 30 September on a `source-map-js` advisory; this
  branch takes 1.2.2, which fixes it.
- **Live on `https://tbn-game.filhmar.online`**, deployed from this branch with
  `scripts/vps_up.sh`: the migration applied and all eight services came up healthy, and the
  worker reaches `qwen3.5-0.8b` on llama.cpp over `llm_gateway`. Without credentials every page,
  API call and socket goes to the password prompt; a wrong password, a forged owner cookie or a
  forged guest cookie gets nothing; an unknown invite answers 410 and `/metrics` 404. A throwaway
  invite, made in the database for five minutes and deleted after, proved the guest path: the link
  set a Secure, HttpOnly cookie and opened the world, the socket and the agents; providers, the
  guest list and a new task were refused; the link refused a second use; and revoking the guest
  shut them out within seconds. The box's other five sites kept answering.
- **Not checked live:** a guest talking to an agent on the guest model, and two people walking
  together, since both need your sign in; the backend and client tests cover them.

## Not built

- Voice chat, as you asked, for later.
- Guests choosing their own look; their id picks it.
- Reassigning anything between guests, or guests seeing each other's agent conversations.

## Waiting for you

- Add the guest model as a provider and pick it on the Guests screen; `docs/vps_setup.md`,
  section 7, has the exact values.
- Merge #21, then #22 (stacked on it), so the box can follow `main` again.
