# Phase 4d plan: build mode and themes

## Goal

The owner arranges and paints their own company. In build mode they place, move, turn, recolour
and remove desks, chairs, partitions, plants and every other prop, and pick a theme for floors,
walls and furniture. The arrangement and theme of each environment are kept in the database, so
the next session opens on the same place, on any device.

## Exit criteria

1. B, or the Build button, opens build mode in the world. Build mode has:
   - an angled top-down camera;
   - a catalog of props by category;
   - a theme tab.
   Its keys: R and Shift+R turn, Delete removes, Ctrl+Z and Ctrl+Shift+Z undo and redo, Escape
   leaves. Leaving with unsaved changes asks first.
2. A placed prop snaps to a 0.25 m grid. A prop that overlaps another or leaves the floor shows
   red and cannot be placed. A layout that cuts the entry, the exit, a desk or the computer off
   from the rest cannot be saved, and the panel says which one is cut off.
3. Saving stores the layout and theme for that environment. A reload, another browser or a later
   session shows the same arrangement. Reset returns the environment to its pack default.
4. Agents follow the layout:
   - desks belong to the department whose zone rug they stand on;
   - an agent whose desk moved walks to the new one;
   - a removed desk sends its agent to a waiting spot.
5. The scene stays inside the phase 4 budget with the largest layout the catalog allows: under
   150 draw calls and 60,000 triangles on screen.
6. Every earlier flow still passes on the default layouts.

## As built

Seven things changed while building; the design below is the plan as it was written.

- **Props are code, not files.** The furniture builders take sizes (a 3.5 m partition, a 2.4 by
  1.2 m table), which a fixed catalog of `.glb` files cannot express. So the client builds every
  prop from the generator's own builders, once per kind, size and variant, and draws them as
  instances. The shell stays a `.glb` that a downloaded pack can replace.
- **One table, not two.** `world_layouts` keeps the placements as JSON beside the theme. A layout
  is always saved and read whole, one row gives one revision check and one change event per save,
  and a placements table would have sent an event for every prop of every save.
- **GET answers `{ layout: null }`** when nothing is saved: the server does not know the pack
  defaults, which live in the client's generated manifests.
- **Lamps stay in the shell** with their lights in the manifest; phase 4e turns them into props.
- **Zone rugs are drawn only in build mode**, so an owner who never builds sees no change. A desk
  on no rug is left free rather than serving overflow, which keeps the waiting anchors.
- **Moves are not handles.** A placed prop is picked up and dropped like a new one, a new prop
  starts at the nearest free spot, and Enter drops what is held, so build mode works from the
  keyboard. Turning is by quarters only, so footprints stay exact.
- **A break spot nobody can reach is dropped, not refused.** A plant against a wall is normal.
  Only seats, the owner's chair, the doorways and the waiting places must be reachable.

## Design

### Shell, props and layouts

Today each pack is one merged scene with the furniture baked in and cut out of the navigation
mesh. The generator splits it in three:

- **The shell.** Floor, outer and inner walls, door frames, window openings and the ceiling: what
  the owner cannot move. It is one merged scene per pack, as today.
- **The prop catalog.** One `.glb` per prop kind, each in the pack's materials, with:
  - its footprint;
  - its anchors (a desk's seat, a spot's position and clip, a lamp's light);
  - the material slots a theme can colour.
  Kinds:
  - desk;
  - computer desk;
  - chair;
  - meeting table;
  - partition;
  - plant;
  - tree;
  - sofa;
  - low table;
  - shelf;
  - counter;
  - fridge;
  - pallet;
  - rug;
  - zone rug;
  - lamp;
  - whiteboard;
  - water dispenser;
  - window blinds;
  - and the phase 4e objects.
- **The default layout.** For each pack, the placements that reproduce today's scene exactly, so
  nothing changes for an owner who never builds.

`docs/assets.md` gains the prop contract. `client/src/game/props/` holds the catalog schema, the
loader and an instanced renderer: one `InstancedMesh` per kind and material keeps sixteen desks
at one draw call per material.

### The navigation mesh at runtime

The generator's grid navigation mesh moves from `client/scripts/assets/kit.ts` into
`client/src/game/world/navGrid.ts`, so the generator and the client share one implementation. It
takes the shell's bounds, the shell's own footprints and every placement's footprint grown by the
walker's radius. The client rebuilds it after each change in build mode, and the reachability
check that refuses a cut off desk is the same flood fill the generator already runs. The
`Navigation` class keeps its interface, so the actors and the owner do not change.

### Zones

A department's zone becomes a zone rug: a placement with a size and a zone number. A desk belongs
to the zone whose rug it stands on. A desk on no rug serves overflow. `deskAssignment.ts` reads
desks and zones from the layout instead of the manifest.

### Themes

A theme is a colour for each material slot:
- floor, wall and wood;
- fabric, metal and accent;
- partition, plant, pot and board.

Four presets ship: Classic, Night shift, Pastel and Industrial. The theme tab offers the presets
and a colour field per slot, and applies them live. A single prop can override its accent colour.

### Data

A new backend module, `world`, depends on nothing but the database, like `identity`. Tables, each
with `owner_id`, each with its `tbn_events` trigger and an entity in `ChangeEventSchema`:

- `world_layouts`:
  - `owner_id`, `environment`, `theme` (json), `revision`, `updated_at`;
  - one row per owner and environment.
- `world_placements`:
  - `id`, `owner_id`, `environment`, `kind`, `x`, `z`, `yaw_deg`;
  - `variant`, `colors` (json), `size` (json, for rugs), `state` (json, used by phase 4e);
  - `created_at`, `updated_at`.

Contracts in `packages/contracts/src/world.ts`, one schema per model with inbound shapes derived
by `pick`:
- `PropKindSchema` and `WorldThemeSchema`;
- `WorldPlacementSchema` and `WorldLayoutSchema`;
- each environment's floor bounds, so the server can check positions.

API, every command idempotent on its `Idempotency-Key`:

| Method and path                   | Does                                                               |
| --------------------------------- | ------------------------------------------------------------------ |
| `GET /world/:environment`         | The layout and its placements, or the pack default when none is saved. |
| `PUT /world/:environment`         | Replaces theme and placements in one transaction. Answers 409 when `revision` is stale. |
| `DELETE /world/:environment`      | Reset: removes the saved layout, so the default applies again.     |

The server checks:
- every kind is known;
- every position is inside the environment's bounds;
- there is exactly one computer desk;
- there are at most 400 placements.

The client checks overlap and reachability, which need the shell's geometry.

Saving replaces the whole layout instead of sending each change. One revision number then settles
two tabs editing at once, and undo is a local history.

### Build mode

- A world sub-mode in the world store, like the conversation, not a route.
- **Camera.** A build pose at 55 degrees, pan with WASD or a right drag, zoom with the wheel.
- **Placing.** Pick a prop in the catalog. A ghost follows the pointer on the floor grid, turns
  green or red, and a click places it.
- **Editing.** Clicking a placed prop selects it, with handles to move and turn, a colour swatch
  and Delete.
- **Saving.** The panel shows unsaved changes, Save, Reset to default and the reachability errors.
- **Agents** keep working while the owner builds. Their homes change only on save.

## Tests

- **Contracts:** the world schemas parse the pack defaults and reject an unknown kind and a
  position off the floor.
- **Backend** (integration on a real database):
  - the repository saves, replaces and resets a layout, scoped by owner;
  - the endpoints, through supertest: auth, a save and a read, a stale revision answers 409, a
    second computer desk answers 400, and a repeated `Idempotency-Key` saves once;
  - the trigger writes a `world_layout` event.
- **Vitest:**
  - `navGrid` builds the same mesh as the generator for each default layout;
  - a cut off desk is reported;
  - desks are assigned to zones by rug;
  - the build mode reducer places, moves, turns, deletes, undoes and redoes;
  - a theme applies to the right materials.
- **Playwright:**
  - place a plant, save, reload, and the plant is there;
  - change the theme, reload, and it holds;
  - Reset brings the default back;
  - the phase 4 story still passes on the default office.

## Objections

- **Room shapes stay fixed in this phase.** Walls, doors and windows are the shell. Moving them
  means rebuilding the walls, the window openings and the outer wall rule from phase 4. Partitions
  and zone rugs already let the owner divide a room, and a wall editor can follow as its own phase.
- **The default layouts are generated, not stored.** An owner who never builds has no rows, and
  improving a pack improves their world too. The cost is that a saved layout keeps the old pack's
  props until the owner resets it.
