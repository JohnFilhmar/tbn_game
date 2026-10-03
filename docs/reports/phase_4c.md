# Phase 4c report: living agents

## Outcome

The agents now live in the office when nobody gives them work, and the owner can talk to any of
them without leaving the world.

- **Wandering.** An idle agent leaves its desk every 8 to 25 seconds to drink at the water
  cooler, look out of a window, check on a plant, doodle on the whiteboard, touch the grass in the
  home garden or stretch its legs, then walks back. Two idle colleagues within 6 m sometimes meet
  and chat. A task, a hand-off or a departure drops a wander at once and sends the agent straight
  to work. The HUD shows a wandering agent as "taking a break" and writes each outing in the
  narration.
- **Talking.** Three ways start a conversation:
  - E within 2 m of an agent in front of the owner. When both are in reach, the HUD shows one
    prompt, for the nearer of the agent and the computer.
  - The Talk button on the agent's HUD row.
  - A click on the agent.

  When the agent is far, the owner teleports to its side first. Then:
  - the owner turns to face the agent and never moves, as asked;
  - the camera leans in over the owner's right shoulder onto the agent's face;
  - the agent stops, waves and keeps a talking pose.

  A panel slides in beside the world. It shows the agent's role, status, open task and run, its
  live transcript with the reply streaming in, and a message box that takes the focus. A speech
  bubble over the agent's head shows what it is saying. Escape or Close ends the conversation and
  the camera glides back.
- **Seven new clips:** `drink` (with a cup in hand), `look`, `write`, `touch`, `stretch`, `talk`
  and `press`. Every clip now sets every node, so a crossfade never leaves a pose behind.
- **The shoulder camera** from the start of this phase frames third person as GTA San Andreas
  does.

## What was checked here

- **Vitest.** New tests cover:
  - the seeded wander, which replays the same way for the same agent;
  - the return to the desk;
  - a task cutting a wander short;
  - one agent per spot;
  - the talk hold;
  - the E prompt choosing between the computer and the agents;
  - the conversation panel end to end against the fake API and the fake socket: the transcript,
    the focus, a sent message, a streamed reply and Escape.
  - the shipped manifests carry spots whose clips the bodies have.
  With two or four workers every test passes except the two cases that also time out on `main`
  on this machine under load (the reports empty state and the first sign in test). CI has always
  passed them.
- **Static checks.** Typecheck and ESLint are clean, and `npm run build:assets` checks every spot
  is on the navigation mesh and reachable.
- **The browser.** Walked through against the running development stack: an agent went to check
  on a plant on its own, and the Talk button opened the conversation with the panel, the focus,
  the transcript and the bubble. The camera framing was tuned from those screenshots.
- **Playwright** on CI only, as before. All 14 flows pass on the pull request, and so does every
  other check:
  - an idle agent takes a break and comes back;
  - the owner talks to the manager, sends a message, reads the agent's reply in the panel and
    closes it with Escape;
  - every earlier flow.
  Two flows needed loosening. The agent story now counts a manager on a break as done, as well as
  one at its desk. The conversation flow accepts any reply from the agent, because the fake
  model's words depend on what came earlier in the agent's transcript.

## What was decided

- **No sofa spot.** The sofa's seat is blocked furniture that no path reaches. Sitting on
  furniture waits for the props of phase 4d.
- **A working agent does not wave.** The wave clip stands an agent up out of its chair, so a
  working agent keeps working while the owner talks to it.
- **A conversation is not a route.** A reload drops it; the desk's chat tab keeps a link to every
  agent's chat.
- **One chat component.** The desk's chat tab and the world's panel render the same
  `Conversation`. `MessageBox` and `TranscriptEntryView` moved to `components/conversation/`, and
  `useTranscript` to `lib/data/`.

## Demo

With the development stack up, at `/app/` in the browser:

1. Sign in, then press Escape to stand up.
2. Wait a few seconds without assigning anything. An agent goes for a break, and the narration
   says where.
3. Walk up to an agent and press E, or press Talk on its row. Write it a message and watch the
   reply stream in the panel and the bubble.
4. Press Escape to end the conversation.

## Waiting for you

Phase 4d, build mode and themes, waits for you to start it. Its plan is in `docs/plans/phase_4d.md`.
