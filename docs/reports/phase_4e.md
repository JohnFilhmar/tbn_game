# Phase 4e report: interactive objects

## Outcome

The office is full of things to use. Near one, in front of the owner, the HUD says what E does,
"Press E to pour a coffee", and lists every prop within reach as a button whichever way the owner
faces. One prompt shows at a time: the nearest of the agents, the props and the computer.

- **Whiteboard.** E turns the camera square onto the board and opens drawing on it: a pen in four
  colours and two widths, an eraser that takes a whole stroke or note, text placed with a click
  or written from the keyboard, undo and clear. It saves a second after the last change and on
  leaving, and the drawing shows on the 3D board after a reload, in any tab.
- **Coffee set and water cooler.** The owner, or an idle agent, plays `drink` with a cup in hand,
  and the prop gives off steam or bubbles.
- **Blinds** hang at every window. E opens or closes them, the slats slide, and the sun and sky
  dim with the share closed, down to 40 percent. The state is kept.
- **Light switch.** E opens a panel of the lamps by zone, each on Auto, On or Off, with All on,
  All off and All auto. The lamps follow at once and stay as left.
- **Patch of grass.** E crouches the owner with `touch`, blades fly, and a toast counts: "You
  touched grass. That makes 4." The count is the `grass_touched` preference.
- Idle agents pour coffee, drink water, look out of the windows and touch the grass on their
  breaks, and every one of these is a prop the owner can add, move or remove in build mode.

Every interaction writes a narration line. Lamps are props now: the shells carry no lights, and
the eight lit lamps nearest the camera cast real light while the rest glow.

## What was checked here

- **Backend tests**, against a throwaway PostgreSQL container on port 55432 with the documented
  test credentials, never the development stack's database. The world, events and knowledge
  suites pass, 12 files and 53 tests:
  - the prop state repository: create then replace in one row, owner and environment scoping, and
    an event for each save;
  - the routes: auth, a save read back with its environment, a replayed `Idempotency-Key`, 400
    for a state that does not fit its kind or a bad placement id, and 413 for a board of about
    650 KB;
  - the trigger coverage spec with the new table, and the preferences defaults with
    `grass_touched`.
  The sandbox, git and story suites, which need the sandbox image, were not run here.
- **Vitest.** The game's 16 files pass, with the new checks:
  - the prompt picks the nearest interaction in front of the owner, props among them, and lists
    every prop in reach;
  - whiteboard content survives a round trip to JSON and redraws the same, keeps to its caps, and
    erases one stroke or note at a time;
  - the eight nearest lit lamps are chosen;
  - blinds scale the daylight;
  - an idle agent sent to a coffee spot pours a coffee and the prop steams.
  The full client run had one screen test time out on its first render, the reports screen's
  empty state; it passes alone, the same load flake as in earlier phases.
- **Static checks.** Typecheck, ESLint and Prettier are clean.
- **Playwright** runs in CI, as before. A new file, `e2e/objects.spec.ts`, draws a stroke and
  writes a word, reloads and finds both, then clears the board; switches a lamp off and closes the
  blinds, reloads and finds both held, then puts them back; and touches grass twice and reads
  the count two higher.

- **The browser.** Walked through against this branch's web process on a second throwaway
  database, at 1280 by 800:
  - the Within reach list on standing up, then a walk left to the board and up to the blinds,
    the same path the Playwright flows take;
  - the blinds closing over the west window;
  - drawing a stroke and writing a word, with the canvas lined up inside the board's frame, the
    save, and the drawing on the 3D board after Done;
  - night: the lamps lighting the room, the panel's zones, and All off darkening it;
  - grass touched twice, the toast counting to 2, the owner crouching and blades flying.

  Two problems were found and fixed this way:
  - a board and a window first put on the south wall blocked half the view: the third person
    camera stands south of the owner, and a wall prop is solid from behind, unlike the outer
    walls, so they moved to the west wall;
  - standing up before the world has loaded leaves the owner at the pack's spawn, not by the
    computer, so the new flows sit down and stand up once the world is ready.

## What changed from the plan

The plan records eight changes under "As built". The two that matter most:

- **Prop state has its own table.** Phase 4d keeps placements inside the layout, so blinds, lamps
  and boards keep their state in `world_prop_states`, one row per placement. Using a prop never
  moves the layout's revision, so it never refuses an open build draft.
- **The office's things to use sit near the computer**, with a window added on the west wall,
  so the owner finds them on standing up and the flows reach them with a short walk.

## Waiting for you

- **A layout saved in phase 4d has no lamps or blinds.** The pack defaults now carry them, and a
  saved layout keeps the props it was saved with, so a saved environment is dark at night until
  you add lamps in build mode or reset it. Every environment you never saved gets them at once.
- The suggested objects in the plan, such as the inbox tray and the cork board, wait for you to
  pick any.

## Demo

With this branch deployed to the development stack (it adds a migration):

```
scripts/stack_up.sh
docker compose -f docker-compose.development.yml run --rm --no-deps web \
  /app/node_modules/prisma/build/index.js migrate deploy
```

Then, at `/app/` in the browser, in the office:

1. Stand up from the desk. The Within reach list offers the light switch and the grass.
2. Walk left to the board on the west wall, draw on it, write a word, press Done, and reload:
   the drawing is on the wall.
3. Use the light switch, set a lamp to Off or press All off, and pick Night in the World menu.
4. From the board, walk up to the window and close the blinds; the room dims.
5. Touch grass twice and read the count.
6. Watch the narration for an agent pouring a coffee at the coffee set by the west wall.
