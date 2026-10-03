# Phase 4d report: build mode and themes

## Outcome

The owner arranges and paints their own company, and it stays that way. B, or the Build button,
opens build mode on the environment shown:

- The camera looks down at 55 degrees and the movement keys pan it.
- The panel offers the catalog by category (desks, furniture, plants, storage, department zones)
  and a theme tab with four presets (Classic, Night shift, Pastel, Industrial) and a colour for
  every material slot.
- A prop from the catalog starts at the nearest spot where it fits. It follows the pointer on a
  0.25 m grid, green where it fits and red where it would stand in a wall or on another prop, and
  a click or Enter drops it.
- A placed prop can be picked up and moved, turned, sized, given a finish or its own colour, or
  removed. Department zones are zone rugs, numbered and shown as tinted areas while building. The
  computer moves but never goes.
- The panel lists every reason the layout cannot be saved yet. Undo and redo cover every change.
  Save keeps the layout and theme in the database for that environment, Reset goes back to the
  pack default, and Leave asks first when there is something unsaved.

Saved layouts come back after a reload, in another browser and in the next session, and another
open tab rearranges when one saves. Agents follow the layout: a desk belongs to the zone whose
rug it stands on, and an agent whose desk moved walks to the new one.

## What was checked here

- **Backend tests.** Run against a throwaway PostgreSQL container on a separate port with the
  documented test credentials, never the development stack's database. All pass:
  - the repository: save, replace, a stale revision, owner and environment scoping, reset, and
    the change events;
  - the routes: auth, save and read, reset, a 409 on a stale revision, a replayed
    `Idempotency-Key` saving once, and 400 for two computers, none, a prop off the floor, an
    unknown kind and an unknown environment;
  - the trigger coverage spec with the new table, and the preferences routes beside it.
- **Vitest.** All 55 game tests pass, including the new ones:
  - every pack's default layout passes the same check build mode uses;
  - overlaps, walls, a blocked doorway, and the one computer rule;
  - the nearest free spot;
  - zones from rugs, and a desk moved off its rug leaving its zone;
  - the fallback for a saved layout without a computer;
  - an unreachable spot left out;
  - theme colours;
  - the draft's place, move, turn, remove, undo and redo.
  The screen tests outside the game behave as in phase 4c on this machine: a couple time out
  under load, as they do on `main`.
- **Static checks.** Typecheck and ESLint are clean.
- **The browser.** Walked through against this branch's web process on the throwaway database:
  - placing a plant;
  - a plant on a desk refused in red;
  - a plant in the doorway naming the entry it blocks;
  - undo;
  - save, and the server returning the new revision with the plant;
  - a reload keeping it;
  - Night shift and Pastel themes;
  - reset back to the default and leave.

  Two problems were found and fixed this way:
  - a theme change put every prop at the room's centre, because instances were not placed again
    when their mesh was rebuilt;
  - a plant against a wall was refused only because its break spot faced the wall.
- **Playwright on CI**, as before: a new flow places a plant, paints the floor, saves, reads it
  back from the server, reloads, resets and leaves. The earlier flows run on the default layouts,
  which reproduce the old packs.

## What changed from the plan

The plan records seven changes under "As built". The two that matter most:

- **Props are built from code.** The furniture comes in any size, which a catalog of fixed files
  could not express, so the client builds props from the generator's own builders and draws them
  as instances. The shell stays a file a downloaded pack can replace.
- **One table.** Placements are JSON beside the theme in `world_layouts`, saved whole, with one
  revision check and one change event per save.

The shell files shrank from about 450 KB to between 16 and 47 KB each. The navigation mesh files
are gone; the walkable grid is built in memory from the shell and the props.

## Demo

With this branch deployed to the development stack (it adds a migration):

```
scripts/stack_up.sh
docker compose -f docker-compose.development.yml run --rm --no-deps web \
  /app/node_modules/prisma/build/index.js migrate deploy
```

Then, at `/app/` in the browser:

1. Stand up from the desk and press B.
2. Take a pot plant from the catalog, move it around, press R to turn it, and click or press
   Enter to drop it.
3. Try dropping one on a desk or in the doorway and read why not.
4. Open Theme and pick Night shift, then Save.
5. Reload; the plant and the colours are there.
6. Press B again and use Reset to go back to the pack.

## Waiting for you

Phase 4e, interactive objects, waits for you to start it. Its plan is in `docs/plans/phase_4e.md`;
its lamps become props there, and its objects go into this catalog.
