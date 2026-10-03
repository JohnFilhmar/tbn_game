# Phase 4c plan: living agents

## Goal

The agents feel alive when nobody gives them work, and the owner can walk up to any of them and
talk. An idle manager or intern wanders to the water dispenser, the window or a colleague, plays a
small animation there and comes back. Walking up to an agent and pressing E leans the camera in
over the owner's shoulder towards the agent, the agent reacts, and a side panel slides in with that
agent's live session and a message box.

Already built on this branch: the third person camera now sits over the owner's right shoulder,
3.2 m back at head height, as GTA San Andreas frames it. The conversation camera below builds on
it.

## Exit criteria

1. An idle agent leaves its desk on its own every 8 to 25 seconds, walks to a free spot, plays that
   spot's animation for a few seconds and returns. Two idle agents at the same spot face each other
   and talk. A task, a hand-off or a departure interrupts a wander at once.
2. Within reach of an agent, the HUD offers "E: talk to <name>". Pressing it, or the Talk button on
   the agent's HUD row, opens the conversation:
   - the owner turns to face the agent without moving;
   - the camera glides to a close over the shoulder view centred on the agent's head;
   - the agent stops, turns and waves, then keeps a talking idle while the panel is open.
3. The conversation panel slides in from the right with:
   - the agent's name, role and status;
   - its current task and run;
   - the live transcript with the streamed reply;
   - the message box.
   The agent's latest streamed line also shows in a speech bubble over its head. Escape or Close
   ends the conversation and the camera glides back.
4. Every new world key goes through `isTypingTarget`, and typing in the panel never moves the
   owner. Under reduced motion every glide and slide is instant.
5. Every phase 3, 4 and 4b flow still passes.

## Design

### Spots

A spot is a place an agent can go when idle: a position on the floor, a facing, a clip and a
length of stay. Each pack's manifest gains a `spots` list, written by the asset generator from the
furniture it already places:

| Furniture        | Spot kind  | Clip    |
| ---------------- | ---------- | ------- |
| water cooler     | `water`    | `drink` |
| window pane      | `window`   | `look`  |
| plant, tree      | `plant`    | `look`  |
| whiteboard       | `board`    | `write` |
| grass (home)     | `grass`    | `touch` |
| open floor space | `stretch`  | `stretch` |
| pallets, shelves, forklift (warehouse) | `look` | `look` |

As built, the sofa has no spot: its seat is blocked furniture, so no path reaches it, and a
seated spot waits for the props of phase 4d.

Phase 4d replaces the manifest list with spots derived from the placed props, so this list is the
seam, not a throwaway.

### Wandering

The client alone decides wandering, like every other walk; the server never knows a position.

- `AgentActor` gains `wander(spot)`, which queues a walk to the spot, a timed clip and a walk home.
- Each queued step carries an `isWander` flag. `startWork`, `visit`, `leave` and `moveHome` drop
  wander steps before queuing their own, so real work always wins.
- A scheduler in `Agents` gives each idle actor a next wander time from a random number generator
  seeded by the agent id. Tests can then replay a wander exactly.
- The scheduler holds one claim per spot, so two agents never stand inside each other.
- A `chat` spot is made on the fly when two idle agents are both due: they meet halfway and face
  each other with the `talk` clip.
- Standing idle at the desk also gets variety: now and then `stretch` or `look` plays in place.

### New clips

`drink`, `look`, `write`, `touch`, `stretch`, `talk` and `press` join `idle`, `walk`, `work`,
`sit` and `wave`. They are authored in `client/scripts/assets/characters.ts` with the existing
bone helpers, listed in the character manifest and in `ClipNameSchema`, and added to the contract
in `docs/assets.md`. `drink` attaches a cup to the right hand node for its length. The owner's
character uses the same set, which phase 4e needs.

### Talking

- **State.** The world store gains `talkingTo: string | null`. A conversation is not a route: it
  is a moment in the world, and a reload drops back to walking. The desk keeps the full chat on
  its own route.
- **Prompt priority.** The nearest of the computer and the agents within 2 m, in front of the
  owner, owns the E key. The HUD shows one prompt.
- **Camera.** `CameraRig` gains a conversation pose. The eye is 1.2 m behind and 0.35 m right of
  the owner's head; the look point is the agent's head; the field of view narrows from 50 to 38
  degrees. The glide is the one built in phase 4b.
- **The owner** turns to face the agent and plays `idle`. Its position never changes, as asked.
- **The agent.** An idle or wandering agent drops its wander, turns to the owner, plays `wave` and
  then loops `talk`. A working agent keeps working: as built, it does not wave, because the wave
  clip stands the agent up out of its chair. When the conversation ends, the scheduler takes it
  from there.
- **The panel.** `game/hud/ConversationPanel.tsx`, an `aside` with the label "Conversation with
  <name>". It is not a modal, so the world stays visible:
  - it slides in from the right in 260 ms with a slight overshoot;
  - it takes the right third on wide screens and the bottom half on narrow ones;
  - focus moves to the message box, and Escape closes and returns focus to the canvas.
- **Shared chat pieces.** The transcript list and the streaming bubble move out of `ChatTab` into
  `components/conversation/` so the desk and the world render one implementation:
  `TranscriptEntryView`, `MessageBox`, `useTranscript`, the stream store and `putTranscriptEntry`.
  The header reads the agent's `active_run_id` and its open task from the runs and tasks already
  cached.
- **The speech bubble.** A DOM element positioned every frame from the agent's live position
  projected through the camera. It shows the last 120 characters of the streaming reply, and the
  last entry once it settles. It is `aria-hidden`; the panel carries the same text.
- **Click to talk.** Clicking an agent in the canvas raycasts against the agent groups and starts
  the same conversation when the owner is within reach, or teleports first when not. The HUD's
  agent rows gain a Talk button next to Go.

## Contracts that change

None on the server. In the client:
- the pack manifest gains `spots`;
- the clip enum grows;
- the world store gains `talkingTo`;
- `CameraRig` gains the conversation pose;
- `AgentActor` gains `wander` and interruptible steps.

## Tests

- **Vitest:**
  - the wander scheduler replays the same wander for the same seed;
  - a task interrupts a wander and walks the agent straight to its desk;
  - two agents never claim one spot;
  - the prompt goes to the nearest of the computer and the agents;
  - the conversation panel renders the transcript and a streamed reply from the fake socket, and
    sends a message;
  - the new manifests and clips parse.
- **Playwright** (reduced motion):
  - with no task running, the narration shows an agent going to a spot and coming back;
  - talking to the manager opens the panel, a message sends, the fake model's reply appears in
    the panel, and Escape closes it.

## Objections

- **The owner turns to face the agent.** "Don't move my character" is kept for position. Without
  a turn the camera looks across the owner's back at an angle, so the plan rotates the owner in
  place.
- **A conversation is not an address.** Reloading drops it. A routed conversation would turn a
  world moment into a fourth kind of view, and the desk's chat route already gives a link to any
  agent's chat.
