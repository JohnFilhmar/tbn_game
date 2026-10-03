# Phase 4 plan: the 3D world

## Goal

The company becomes a place. After sign in the owner is in a semi low poly 3D scene with their
own character, and every agent is there too: at a desk in its department's zone, walking to
work, handing a task to an intern, bringing the result back, arriving through the door when it is
hired and leaving through it when it ends. The scene is one of three environment packs, lit by the
time of day the owner chose or by their real clock, seen from a third person or a top-down camera.
The virtual desktop of phase 3 is a computer in the scene the owner walks up to. Nothing the agents
do in the world comes from anywhere but the backend's events; the server never knows a position.

## Exit criteria

1. When the owner assigns a task, the right agent walks to its desk and works; when a manager
   delegates, it walks to the intern, hands off and returns; interns arrive through the entry
   when spawned and leave through the exit when terminated. This holds in both camera modes and
   in all three environments.
2. 60 frames per second on a mid-range laptop. This session cannot measure a laptop, so the
   scenes are built to a budget (under 60,000 triangles and 150 draw calls on screen, one shadow
   map) and the report gives the frame time measured here in software rendering as a lower bound;
   the owner reads the frame counter in the demo.
3. The three packs, the asset manifest and the contract in `docs/assets.md`; third person
   controls; the camera toggle; character customisation for the owner and every agent; the four
   fixed times of day and the clock; the in-world computer that opens every phase 3 screen.

## Design

### Where the code goes

```
client/
  src/game/
    assets/        the asset manifest and pack manifest schemas, loaders, part and palette helpers
    world/         the scene: pack, lighting and time of day, cameras, the owner's character
    npcs/          world events derived from change events, the agent state machine, pathfinding
    hud/           the overlay: status, controls help, narration, world menu, customisation
    WorldLayout    the canvas with the desktop screens as an overlay route
  src/game/packs/<office|home|warehouse>/   manifest.json, scene.glb, navmesh.glb
  src/game/characters/                       base.glb and the part files, manifest.json
  scripts/buildAssets.ts                     writes every glb above from code
docs/assets.md                               the pack and character contract
```

- Three.js through React Three Fiber, `three-pathfinding` over each pack's navigation mesh, and
  the Rapier character controller the architecture names (see the objections). Game state that
  changes every frame stays out of React: positions and animation live in refs and a zustand
  store updated in `useFrame`; React renders the HUD and the overlay.
- Every model and clip is reached through the asset manifest by slot name. Files are imported
  through Vite, so they ship under content-hashed names with immutable caching, as the
  architecture asks; replacing a pack is replacing its files and manifest and rebuilding.

### Environment packs

A pack is a directory with `manifest.json`, `scene.glb` and `navmesh.glb`. The manifest gives
the pack's name and title, the scale, the owner's spawn, the entry and exit points, the computer
with its use radius, the department zones with their desks and seats, overflow anchors, and the
lighting profile: ambient colour, sun azimuth and the interior lights. The navigation mesh is the
walkable floor with the furniture cut out; NPCs path across it and the owner is kept on it. Three
packs ship: an office of cubicle islands, a home with a living room, kitchen, study and garden,
and a warehouse of workbenches between shelves. Each has four zones of four desks; departments
take zones in creation order and agents take desks in their zone, the manager first, and an agent
past the last desk stands at an overflow anchor.

### Characters and customisation

A character is a hierarchy of named nodes, `hips`, `spine`, `head`, `arm_l`, `arm_r`, `leg_l`,
`leg_r`, with rigid meshes under them and animation clips `idle`, `walk`, `work`, `sit` and
`wave` that move the nodes. Parts attach to a named node: hair and accessories to `head`, outfits
to `spine`; `body` picks the base variant. Palette slots are material names, `skin`, `hair`,
`top`, `bottom`, `shoes` and `accent`, and a colour in `appearance.colors` recolours that
material. The `appearance` an agent already carries fits this exactly; the owner's character gets
the same shape as a preference. An agent whose appearance is empty gets a stable look derived from
its id, so a roster never looks like clones. The recruit form and the profile tab offer the
manifest's parts and colours instead of free text, and the owner customises their own character in
a dialog in the HUD with a live preview.

### Time of day

A preference, `time_of_day`: `morning`, `noon`, `afternoon`, `night` or `clock`. The fixed
modes map to hours 8, 12, 17 and 22; `clock` reads the owner's real time in their `time_zone`
preference and refreshes every minute. The hour drives the sun's elevation and colour along the
pack's azimuth, the sky and ambient colours, the fog, and the interior lights, which come on
from dusk.

### The owner's character and the cameras

Keyboard moves the character (WASD and the arrow keys, Shift to run), the mouse orbits in third
person, the wheel zooms, `C` toggles the camera and `E` uses what is in reach. The top-down camera
looks straight down from above the character and follows it; the controls stay screen-relative.
The toggle changes the camera rig only. A camera mode is a device setting kept in local storage.

### Agents in the world

The client turns the change events it already applies to the cache into world events: a task
going `in_progress` is `task_started` for its assignee; a task inserted with a delegator is
`handoff` from the delegator to the assignee; an agent inserted at level 2 is `intern_arrived`; an
agent turning `terminated` or `dismissed` is `agent_left`; a task with a parent finishing is
`result_returned` from the assignee to the delegator. Each agent has a state machine fed by these:
`at_desk`, `walking`, `working`, `handing_off`, `returning`, `arriving`, `leaving`. A walk is a
path over the navmesh followed at walking speed with the `walk` clip, work is the `work` clip at
the desk, a handoff is a walk to the other agent's desk, the `wave` clip and a walk back. On load
and on a pack switch every live agent is placed at its desk at once; nothing walks that the owner
did not see happen. Events that arrive while the tab was away replay through the same machine, so
the world ends in the right state.

### The in-world computer and the HUD

Within the computer's use radius the HUD offers `E` to use it, which opens the desktop overlay on
the last screen the owner had open, `/agents` the first time; `Escape` or the overlay's close
button returns to the world. The desktop screens keep their routes under the world layout, so
every deep link still works, and the canvas stays mounted behind the overlay. The HUD also holds
the live light, a Desk button for keyboard and touch users, the camera toggle, a world menu with
the environment and time of day, the customise button, and a narration panel that writes each
world event as a sentence. The panel is the world for anyone who cannot see the canvas, and what
the tests read.

### Backend changes

- Three preferences: `environment` (`office`, `home`, `warehouse`; default `office`),
  `time_of_day` (default `clock`) and `owner_appearance` (the `AppearanceSchema` shape, default
  empty). Preferences already reach the client live, so a change in the desk or the HUD moves the
  world at once.
- Nothing else, unless the owner answers the first objection below: then a `world_events` table
  written by the company and runtime services at each semantic moment, with its trigger, its
  entity in `ChangeEventSchema`, its hydrator loader and `GET /world_events`, in the `world`
  module.

### What waits for a later phase

- Touch controls, the phone frame rate measurement and the Capacitor shell: phase 5.
- The Tauri shell: phase 6.

## Tasks

1. Plan, roadmap, the draft pull request.
2. Backend: the three preferences and their tests.
3. Assets: `scripts/buildAssets.ts`, the character set, the three packs, `docs/assets.md`.
4. World: manifests and loaders, the scene, lighting and time of day, the owner's character and
   both cameras, the computer and the overlay route.
5. Agents: world events, the state machine, pathfinding, desk assignment, the narration panel.
6. Customisation: the owner's dialog, the part and colour pickers in recruit and profile, the world
   menu, the preferences screen.
7. Tests, the demo, CLAUDE.md, the architecture, the report, CI green.

## Contracts that change

### Schemas in `@tbn/contracts`

- `PreferencesSchema` gains `environment`, `time_of_day` and `owner_appearance`, with
  `EnvironmentNameSchema` and `TimeOfDaySchema`.
- If the owner asks for server world events: `WorldEventSchema` and `world_event` in
  `EventEntitySchema` and `ChangeEventSchema`.

### Routes

None, unless the owner asks for server world events: `GET /world_events`.

### Files

- `docs/assets.md`: the pack manifest, the character hierarchy, the clip names, the part files,
  the palette slots, the scale and the licence note.

## Tests required

- Client, Vitest:
  - the pack and asset manifest schemas accept the shipped files and reject a missing anchor;
  - world events derived from each kind of change event, and from a replayed batch;
  - the agent state machine: start, delegate, return, arrive, leave, and a pack switch that
    places everyone at once;
  - desk assignment by department zone and the overflow anchors;
  - the hour from each time of day and from the clock in a time zone, and the sun and sky it
    gives;
  - the stable appearance derived from an agent id, and the palette applied to materials.
- Playwright, against the built web process and worker with the fake model: sign in lands in the
  world; assign a task and the narration says the agent walked to its desk and works; the fake
  delegates to an intern and the narration says it arrived, the manager handed off and the result
  came back; the intern leaves when terminated; the same with the camera toggled and in each
  environment, with a screenshot of each; the computer opens the desk and `Escape` closes it.
- Backend, Jest: the three preferences round trip and reject a bad value.
- Operations: none.

## Where I think the brief is wrong for this phase

1. **Server-sent world events.** The entity events the client already receives carry every
   semantic moment: a task starting, a delegated task appearing, an intern inserted or ended, a
   subtask finishing. A second stream of world events would say the same things again in the log
   and the hydrator, so the client should derive the world's events from the entity events it has.
2. **Rapier for the owner's character.** Rapier adds a 2 MB WebAssembly physics engine and a
   second collision model next to the navigation mesh, for one character that only needs to stay
   on the walkable floor. Keeping the character on the navmesh, as every NPC is, leaves one source
   of truth and a smaller first load.

Both are built as the brief says unless the owner answers.

### What this session cannot do

`kenney.nl`, `quaternius.com` and `github.com` are refused by this session's proxy, so no CC0
pack can be downloaded here. The three packs and the character set are authored by a script in
this repository, under CC0, to the contract in `docs/assets.md`; a Kenney or Quaternius pack
replaces them by meeting the same contract. A laptop's frame rate cannot be measured here either;
the report says what was measured and how.
