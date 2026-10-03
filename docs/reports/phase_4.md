# Phase 4 report: the 3D world

## Outcome

Phase 4 meets its exit criteria as far as this session can check them: the company is a 3D world
the owner walks through, every agent is in it at a desk in its department's zone, and when the
owner assigns a task the right agent walks to its desk and works, hands a part to an intern who
walks in through the door, gets the result brought back, finishes, and watches the intern leave
through the door. This holds in both camera modes and in all three environments. The frame rate
on a mid-range laptop is the one thing this session cannot measure; the budget and the software
rendering numbers are below, and the demo puts the frame counter in your HUD.

- **The world.** After sign in the owner lands in the office, at the hour their time zone says,
  with their own character by the door. WASD or the arrows walk, Shift runs, the mouse looks
  around, the wheel zooms, `C` switches to the top-down camera and back, and `E` within reach of
  the computer opens the desk over the world, every screen of phase 3 on its own route. Escape or
  the World button returns. The three packs, office, home and warehouse, each have four zones of
  four desks, a computer, an entry and an exit, overflow anchors and a lighting profile; switching
  packs from the World menu or the preferences moves everyone to their desks at once.
- **The agents.** The client turns the change events it already receives into world events, so
  nothing new crosses the wire and the server never knows a position. Each agent is an actor with a
  queue of steps over the pack's navigation mesh: a task starting walks it to its seat to work, a
  delegation walks the manager to the intern's desk to wave and back, a finished part walks the
  intern to the manager with the result, a new intern walks in through the entry and a terminated
  one out through the exit. A pack switch places everyone instantly. The narration panel writes
  each thing that happens as a sentence and lists what every agent is doing; it is the world for
  anyone who cannot see the canvas, and what the flows read.
- **Characters.** Three body variants, twelve parts and a six slot palette, assembled from the
  character set by the appearance an agent carries, which the recruit form and the profile tab now
  offer as parts and colours instead of free text. An agent whose appearance was never touched
  gets a stable look of its own from its id. The owner customises their character in a dialog
  with a live preview, saved as the `owner_appearance` preference.
- **Time of day.** Morning, noon, afternoon and night at fixed hours, or the owner's real clock in
  their time zone, read again every minute. The hour sets the sun's elevation and colour along the
  pack's azimuth, the sky, the ambient light and the fog, and switches the interior lights on from
  dusk; the night keeps a faint moon.
- **Tests.** 28 Vitest tests for the game: the shipped manifests and the schemas that reject a
  missing anchor, the appearance resolver and the derived look, the time of day, the world event
  derivation, the seat assignment and the actor's walks, errands, arrival, departure and pack
  switch, plus the world layout in a browser without WebGL. Four Playwright flows walk the world
  against the built stack and a fake model that now plays a delegation: landing, the camera
  toggle, walking to the computer and opening the desk; the three environments in both cameras
  and the night, with a screenshot of each; customising the owner; and the whole agent story read
  from the narration. The six phase 3 flows still pass through the desk overlay, and the whole
  suite passed twice in a row here. CI is green on the pull request, including both image jobs
  with Trivy and signing.

## What could not be done here

- **60 frames per second on a mid-range laptop.** This session has no GPU; Chromium renders the
  world in software here. The scenes are built to the plan's budget, under 60,000 triangles and
  150 draw calls on screen with one shadow map: the office is 4,542 triangles in 14 meshes, the
  home 3,644 in 15, the warehouse 4,754 in 11, and a dressed character about 250 triangles in 20
  meshes. Software rendering at 1280 by 720 managed 5 to 36 frames per second with eleven agents
  on screen, which is a floor, not a measurement. Read the counter in the HUD on your laptop.
- **Downloaded art.** The Kenney and Quaternius hosts return 403 through this session's proxy, so
  the packs and the character set are written by `client/scripts/assets/` under CC0, to the
  contract in `docs/assets.md`. A downloaded pack that meets the contract replaces a generated one
  by replacing its files and manifest.
- **A real model.** Every flow ran against the fake. The demo script prints the browser steps to
  follow with your key.

## Demo

With the development stack up and the owner created, from the repository root:

```
scripts/stack_up.sh
docker compose -f docker-compose.development.yml run --rm --no-deps web \
  /app/node_modules/prisma/build/index.js migrate deploy
TBN_USERNAME=john TBN_PASSWORD="$PASSWORD" scripts/demo_phase_4.sh
```

The script checks that the stack serves the client with all 21 model files, that your account
signs in and that the three world preferences take their values and come back. Then it prints the
steps: sign in and land in the world, walk, switch cameras, use the computer, recruit and assign
a delegating task and watch the story, switch environments and the time of day, customise your
character, and read the frame counter.

To run the flows yourself: `npm run build`, then
`E2E_DATABASE_URL=postgresql://tbn:tbn_development_only@127.0.0.1:5432/tbn_e2e npm run e2e`.

## What was done

- **Backend.** Three preferences, `environment`, `time_of_day` and `owner_appearance`, checked
  against their schemas; a preference may now hold an object. The empty `world` module placeholder
  is gone: every world setting is a preference and the world's events are the entity events.
- **Assets.** `client/scripts/assets/` writes the three packs and the character set with
  Three.js's glTF exporter: scenes of one mesh per material, a navigation mesh over the walkable
  floor with the furniture cut out, manifests with every anchor, and bodies with named nodes and
  five clips. The generator refuses a pack whose anchor is off the floor or unreachable from the
  entry. `docs/assets.md` is the contract. The files are committed and ship hashed through Vite.
- **The world.** `client/src/game/`: Zod schemas and loaders for the manifests, the appearance
  resolver, the React Three Fiber canvas with the pack scene, the lighting from the hour, the two
  camera rigs, the owner's character clamped to the navigation mesh with `three-pathfinding`, the
  world events, the seat assignment, the agent actors, and the HUD with its dialogs. The desk
  layout became an overlay with a way back to the world; sign in lands at `/`.
- **Tests, demo, docs.** The Vitest and Playwright tests above, the fake model's delegation story,
  `scripts/demo_phase_4.sh`, `CLAUDE.md`, `docs/architecture.md`, `docs/assets.md`, the plan as
  built, the roadmap and this report.

## What was decided

The plan's two objections went to you before building and you took both: world events are derived
on the client, and the owner's character stays on the navigation mesh without Rapier. These came
up while building:

- **Outer walls have one face.** The third person camera sits outside the room when the owner is
  near a wall, and a wall with two faces hid everything. Outer walls are now single planes facing
  the room, so a camera outside looks straight through them; inner walls and furniture keep their
  thickness.
- **Models are never inlined.** Vite inlines small assets as data URLs, and the page's content
  security policy refuses to fetch them, so the first load of a hair part crashed the world. The
  build keeps every `.glb` a file.
- **Each character loads behind its own boundary.** One Suspense boundary over the whole scene
  hid the room every time a character's files arrived; each character now has its own, and the
  set is preloaded when the world starts.
- **No drei.** The world needed only its glTF hook; React Three Fiber's own loader does the same
  with three's loader, and the dependency and a large chunk went.
- **The idle agent stands by its desk.** An agent that sat at its desk all day would never walk
  when a task starts; an idle agent stands behind its chair and walks to the seat to work, so
  every task is a walk, and every finish a walk back.
- **A leaving agent finishes its errand first.** The sweep ends an idle intern seconds after its
  part is done, often while it is still walking in; dropping its queued steps lost the walk that
  brings the result back. An agent told to leave now walks out after what it was doing.
- **The HUD's dialogs sit outside the overlay.** The overlay lets pointer events through to the
  canvas, which the dialogs inherited; they now render beside it.
- **The desk's Escape returns to the world** unless the focus is in a field or a dialog, so
  Escape still cancels a dialog first.

## Waiting for you

Read the frame counter on your laptop in each environment and camera, with a few agents working.
If it stays under 60, the first things to try are a lower device pixel ratio cap in `World.tsx`
and a smaller shadow map in `Lighting.tsx`; both are one number.

Phase 5, mobile, waits for you to start it.
