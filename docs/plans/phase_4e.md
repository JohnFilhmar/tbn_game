# Phase 4e plan: interactive objects

## Goal

The office is full of things to use. The owner and the agents can:
- draw and write on a whiteboard that keeps what is on it;
- pour a coffee or a cup of water;
- open and close the blinds;
- switch the lights from a panel;
- touch grass.

Each object is a prop from phase 4d, so the owner can add, move or remove any of them in build
mode. Each one plays an animation from phase 4c and makes the world react.

## Exit criteria

1. Near an interactive prop, in front of the owner, the HUD shows its verb, for example "E: pour
   a coffee". One prompt shows at a time: the nearest of the agents, the props and the computer.
2. **Whiteboard.** E turns the camera square onto the board and opens drawing on it:
   - a pen in four colours and two widths;
   - an eraser, and text placed with a click and typed;
   - undo and clear.
   The drawing shows on the 3D board for as long as the board exists, across reloads and devices.
3. **Coffee set and water dispenser.** The owner, or an idle agent, walks to the prop, plays
   `drink` with a cup in hand, and the prop shows steam or bubbles.
4. **Window blinds.** E opens or closes them. The slats animate, the room's daylight dims with the
   share of windows closed, and the state is kept.
5. **Light switch.** E opens a panel listing each light by zone. Each light is Auto (follows the
   time of day), On or Off, with All on, All off and All auto. The lamps and their light follow at
   once, and the state is kept.
6. **Patch of grass.** E crouches the owner with `touch`, a few blades fly, and a toast says so,
   with a running count kept in the owner's preferences: "You touched grass. That makes 4."
7. Idle agents use the coffee set, the water dispenser, the window and the grass as wander spots.
8. Every interaction can also be reached without the canvas: the HUD lists the props within reach
   as buttons. The whiteboard and light panels are accessible dialogs.

## As built

Eight things changed while building; the design below is the plan as it was written.

- **One prop state table.** Phase 4d keeps placements as JSON in `world_layouts`, so there is no
  placement row to give a `state` column. `world_prop_states` holds one row per owner and
  placement for blinds, lamps and whiteboards alike, the board's drawing being its state. A
  state stored inside the layout would move its revision on every blind and refuse an open build
  draft with 409, and a pack default prop has no saved layout to write into.
- **One route and one event.** `GET /world/:environment/props` and
  `PUT /world/:environment/props/:placement_id` take the kind and its whole state, checked against
  that kind's schema; a `world_prop_state` event carries every change. The server trusts the kind
  the owner names, because the pack defaults it would check against live in the client.
- **The caps.** More than 2,000 strokes fails the schema with 400; content over 256 KB answers
  413 from the service, under the 1 MB body limit.
- **Lamps hang at a fixed height per variant**, a panel at 2.7 metres and a high bay at 5.2,
  because a prop is built once per kind and not per pack ceiling. The warehouse uses high bays.
- **Blinds are their own prop**, hung at a shell window, not a variant of a window prop: windows
  stay in the shell, as phase 4d's objection kept the room shapes.
- **The owner never walks to a prop.** E is offered only within reach, so the owner turns to face
  the prop itself and plays the clip where they stand. The spot's own facing is placed for agents.
- **The office's things to use sit beside the computer**, with a new south window for blinds.
  Standing up from the desk leaves the owner there, which is also where every Playwright flow
  starts, so the flows reach each object without a long walk.
- **An idle agent pouring a coffee is a Vitest check.** Wandering is seeded by the agent's id, so
  which spot a fresh e2e agent picks is not fixed. Vitest runs the scheduler with a coffee spot
  alone; the e2e break flow accepts "pours a coffee" among the break lines.

## Design

### Interactions

`client/src/game/props/interactions.ts` maps a prop kind to:
- its verb;
- its reach;
- the spot the user stands on, with a facing and a clip;
- what the interaction does.

The HUD prompt and the agents' wander spots both read this one table, so every new object an
owner places is usable by both at once. An interaction never moves the owner farther than the
prop's reach. When the owner is already in reach, they turn to the spot's facing and play the
clip where they stand.

### State

Phase 4d's `world_placements.state` column holds each prop's own state:
- blinds: `{ "open": true }`;
- a lamp: `{ "mode": "auto" }`.

`PATCH /world/placements/:id/state` changes it with the state schema of that kind, and is
idempotent on its `Idempotency-Key`. The placement's change event updates every open tab.

### The whiteboard

- A new table, `world_whiteboards`, holds one row per board placement:
  - `placement_id`, `owner_id`, `content` (json), `updated_at`;
  - its `tbn_events` trigger, and an entity in `ChangeEventSchema`.
- The content is vectors, not pixels: strokes as lists of points between 0 and 1 with a colour and
  a width, and text items with a position, a colour and a size. This is small, redraws sharply at
  any size, and can be erased one stroke at a time. The server caps it at 256 KB and 2,000
  strokes.
- `PUT /world/whiteboards/:placement_id` saves the content, debounced to one save a second while
  drawing.
- **Drawing.** E glides the camera to a board pose square onto the board. A DOM `canvas` the size
  of the board's projection takes pointer events; the toolbar sits under it. Escape leaves.
- **On the board.** The 3D board draws the same content onto a `CanvasTexture`, so what the owner
  drew stays on the wall.

### Lights

The pack's interior lights become lamp props, each with a point light. With many lamps a forward
renderer slows down, so only the eight lamps nearest the camera that are lit cast real light. The
others glow with the emissive material phase 4 already uses. A lamp on Auto follows `interiorOn`
from the hour, as today. On and Off override it.

### Blinds

Blinds are a variant of a window prop. The share of closed windows scales the directional light
and the hemisphere light, down to 40 percent with every blind closed.

### Feedback

Steam, bubbles and grass blades are a handful of instanced billboards that live two seconds. The
cup is a small prop attached to the hand node for the length of `drink`. Every interaction writes
a narration line, so the panel and the tests read it.

## Suggested objects

Ranked by how much they tie the world to the work, which the phase 4b council named as what makes
it a game. Each is a prop kind with an interaction and needs no new table. None is in this phase
unless the owner picks it.

1. **Inbox tray** on the owner's desk. Its paper stack grows with pending approvals; E opens the
   approvals screen at the computer.
2. **Cork board.** A pinned card for each of the latest reports; E on a card opens that report.
3. **Server rack.** A blinking light for each running sandbox job; E opens the sandbox jobs.
4. **Wall clock.** Shows the world's hour; E opens the time of day choice.
5. **Sofa and beanbag.** The owner or an agent sits back. An agent idle for long naps there.
6. **Exit door.** E offers the other environments and travels there through a fade.
7. **Plants that need care.** A plant droops after three days without water; a watering can
   revives it.
8. **Trophy shelf.** A trophy appears for each milestone: the first merged request, the tenth
   report, the hundredth task.
9. **Radio.** Plays a calm loop, off by default. It would be the game's first sound and needs a
   CC0 track.

## Contracts that change

- **Placements:** a state schema per kind.
- **Whiteboards:** the whiteboard model, its table and its endpoint.
- **Change events:** a `world_whiteboard` entity.
- **Preferences:** `grass_touched`, a number.
- **Prop catalog:** the interactive kinds:
  - coffee set and water dispenser;
  - blinds;
  - light switch;
  - grass patch.

## Tests

- **Contracts:** each kind's state schema, and the whiteboard schema with its caps.
- **Backend** (integration):
  - state changes and whiteboard saves, scoped by owner;
  - the endpoints, through supertest: auth, the happy path, a state that does not fit its kind
    answers 400, and a board over the cap answers 413;
  - both write their change events.
- **Vitest:**
  - the prompt picks the nearest interaction in front of the owner;
  - whiteboard strokes survive a round trip to JSON and redraw;
  - the eight nearest lit lamps are chosen;
  - blinds scale the daylight.
- **Playwright:**
  - draw a stroke and type a word on the whiteboard, reload, and both are on the board;
  - close the blinds and switch a light off, reload, and both hold;
  - touch grass twice and read "That makes 2";
  - an idle agent pours a coffee in the narration.

## Objections

- **This phase comes after build mode.** The objects are props so that the owner can place them,
  as asked. Building them first on fixed pack spots would mean moving them all again in phase 4d.
- **The whiteboard is one owner's board.** There is one owner and no sharing, so the board needs
  no live drawing between users. Two tabs at once take the last save.
