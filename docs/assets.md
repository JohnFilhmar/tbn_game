# Assets

The world loads two kinds of asset: an environment pack and the character set. Both are
directories of glTF binaries with a `manifest.json`, under `client/src/game/`; a pack's props
are built from code. Code reaches a model or a clip only through a manifest slot name, never by
file path; the loaders in
`client/src/game/assets/` import the files through Vite, so they ship under content-hashed names
with immutable caching. Replacing a pack is replacing its files and manifest and rebuilding the
client.

Every shipped file is written by `npm run build:assets --workspace @tbn/client` from the code in
`client/scripts/assets/`. The generated files are committed, so the client builds without running
the generator; the script is how they are remade. Everything it writes is dedicated to the public
domain under CC0 1.0. A downloaded pack can replace a generated one as long as it meets the
contract below.

## Units and axes

- Metres, Y up, right handed, as glTF requires. A `scale` in a manifest multiplies the whole
  pack or character on load, so a pack authored in other units gives the factor that makes it
  metres and keeps its anchors in metres.
- A character faces +Z. A yaw is in degrees, clockwise seen from above: yaw 0 faces +Z, yaw 90
  faces +X, yaw 180 faces -Z, yaw 270 faces -X.
- A position is `[x, y, z]`. Floor anchors have `y` 0; a desk top or a screen has its own height.
- Manifest keys are `snake_case`, like every JSON payload in the project.

## Environment packs

A pack is `client/src/game/packs/<name>/` with `manifest.json` and `scene.glb`. Three ship:
`office`, `home` and `warehouse`. The `environment` preference names the one in use.

A pack has three parts:

- **The shell** is what the owner cannot move: floors, outer and inner walls, door frames,
  windows and the ceiling lamps. It is `scene.glb`.
- **The props** are everything the owner can place, move, turn, size, repaint and remove in build
  mode: desks, tables, partitions, plants, shelves and the rest. They are not files. The catalog
  in `client/src/game/props/catalog.ts` builds each kind from code at the origin, once per kind,
  size and variant. It gives each kind its footprint and its anchors: a desk's seat, the
  computer, a spot.
- **The layout** says where each prop stands. The manifest's `default_layout` is the one a pack
  starts with. An owner's saved layout replaces it, per environment, in the database.

### The manifest

| Key              | Type                        | Meaning                                                     |
| ---------------- | --------------------------- | ----------------------------------------------------------- |
| `name`           | string                      | The pack's id; its directory and the `environment` preference. |
| `title`          | string                      | What the world menu shows.                                  |
| `scale`          | number                      | Applied to the shell on load.                               |
| `scene`          | string                      | The shell file, relative to the manifest.                   |
| `bounds`         | `{min_x, max_x, min_z, max_z}` | The floor rectangle: the walking grid, the top-down camera and the fog use it. |
| `ceiling`        | number                      | The ceiling height; the top-down camera sits above it.      |
| `spawn`          | anchor                      | Where the owner's character stands at first and after a switch. |
| `entry`          | anchor                      | Where a new intern appears and starts walking in.           |
| `exit`           | anchor                      | Where a leaving agent walks to before it disappears.        |
| `waiting`        | anchor[]                    | Overflow anchors: an agent past its zone's last desk stands here. |
| `spots`          | spot[]                      | The shell's own spots, such as a window; every prop brings its own. |
| `blocks`         | footprint[]                 | The floor the shell's walls block, `{minX, maxX, minZ, maxZ}`. |
| `lighting`       | lighting                    | The pack's lighting profile.                                |
| `default_layout` | placement[]                 | The props the pack starts with, as `WorldPlacementSchema` in `packages/contracts` describes them. |

An anchor is `{position, yaw_deg}`. A placement is a prop `kind`, a floor point `x`, `z` and a
`yaw_deg`. Optional fields:
- `width` and `depth` for the kinds that come in any size;
- `zone` for a zone rug;
- `variant` for a finish;
- `color` to repaint one prop.

The layout makes what the world used to read from the manifest:
- **Zones.** A zone rug, a placement of kind `zone_rug` with a `zone` number, makes a department's
  zone. Every desk whose seat stands on the rug belongs to that zone, in the layout's order, so the
  manager keeps the first.
- **The computer.** The computer desk, of which a layout has exactly one, gives the in-world
  computer: `position` is its screen, `yaw_deg` the way its user faces, and `use_radius` how near
  the owner must stand.
- **Spots.** Each prop's spots join the shell's. A spot nobody can reach is left out.

A spot is an anchor with `kind`, `clip` and `seconds`: the standing point and facing, what the spot
is (`water`, `window`, `plant`, `board`, `grass`, `stretch` or `look`), the clip an agent plays
there, and how long it stays.

Lighting is `{ambient, sun_azimuth_deg, interior}`. `ambient` is the hex colour of the ambient
light at noon; the time of day scales and tints it. `sun_azimuth_deg` is the compass direction
the sun shines from at noon, with the same convention as a yaw. `interior` lists the lights that
come on from dusk, each `{position, color, intensity, distance}` in Three.js point light terms.

### The shell

`scene.glb` holds one mesh per material, named after the material, with no textures. Material
names are the theme's slots (`floor`, `wall`, `wood` and so on), so a theme can colour the shell
and the props alike. Two other names are read: `light` is the lamps, which never cast shadows,
and `glass` is rendered translucent. The shell is static; nothing in it moves.

### Walking

There is no navigation mesh file. The world builds the walkable floor in memory from the bounds,
the shell's `blocks` and every prop's footprint. The floor is a grid of 0.5 metre cells, each one
walkable when its centre is at least the character radius, 0.3 metres, from every footprint, and
it is rebuilt whenever the layout changes. NPCs path across it with `three-pathfinding`, and the
owner's character is clamped to it every frame. The pack generator and build mode run the same
check, `layoutProblems`: one computer, no prop off the floor, in a wall or on another prop, and
every seat, chair, doorway and waiting place reachable from the entry.

Doors are gaps in the walls with a frame; the floor runs through them. `entry` and `exit` sit just
inside the door, so an arriving agent appears in the doorway and a leaving one disappears there.

## Characters

The character set is `client/src/game/characters/` with `manifest.json`, one file per body
variant and one per part. The same set dresses the owner and every agent.

### The manifest

| Key       | Type                                        | Meaning                                                 |
| --------- | ------------------------------------------- | ------------------------------------------------------- |
| `version` | number                                      | 1.                                                      |
| `scale`   | number                                      | Applied to every body and part on load.                 |
| `bodies`  | `{<name>: {file, width, height}}`           | The body variants: `regular`, `slim`, `broad`. A part attached to a body is scaled by its `width` on X and Z and its `height` on Y. |
| `clips`   | string[]                                    | The clip names every body carries.                      |
| `attach`  | `{hair, outfit, accessory}`                 | The node each kind of part attaches to.                 |
| `parts`   | `{hair: {...}, outfit: {...}, accessory: {...}}` | Part name to file, per kind.                        |
| `palette` | `{skin, hair, top, bottom, shoes, accent}`  | The default colour of each palette slot.                |

### The body

A body file holds a hierarchy of named nodes with rigid meshes under them, standing on the
origin and facing +Z:

```
hips
  pelvis
  leg_l, leg_r
    thigh_<side>
    shin_<side>
      calf_<side>, shoe_<side>
  spine
    torso
    arm_l, arm_r
      sleeve_<side>, hand_<side>
    head
      skull, eye_l, eye_r
```

Each mesh carries one material named after its palette slot: `skin`, `hair`, `top`, `bottom`,
`shoes` or `accent`; `eyes` is fixed. Recolouring a slot recolours every mesh with that material
on the body and on its parts.

The clips are `idle`, `walk`, `work`, `sit`, `wave`, `drink`, `look`, `write`, `touch`, `stretch`,
`talk` and `press`, as quaternion and position tracks on the named nodes, so one clip plays on
every body variant. Every clip sets every node of `spine`, `head`, both arms, both legs and both
shins, so a crossfade never leaves a node posed by the clip before. `touch` crouches; the runtime
puts a cup in `hand_r` while `drink` plays. `walk` is a cycle of 0.8 seconds at a
walking speed of 1.4 metres per second; the runtime scales its speed when the character runs.
`work` and `sit` lower `hips` to a seated height; `work` types.

### Parts

A part file holds one group named after the node it attaches to, `head` or `spine`, with meshes
placed relative to that node. The loader adds the group under that node of the body, scaled by
the body's `width` and `height`. Hair: `short`, `long`, `curly`, `bun`. Outfits: `vest`,
`apron`, `tie`, `scarf`. Accessories: `glasses`, `cap`, `headset`, `beanie`.

### Appearance

An agent's `appearance` and the owner's `owner_appearance` preference share one shape, the
`AppearanceSchema` in `packages/contracts`: `body`, `hair`, `outfit` and `accessory` name a body
variant or a part, and `colors` maps a palette slot to a hex colour. A missing field takes the
manifest's default body, no part, and the palette colour. A name the manifest does not have is
ignored, so an old appearance survives a character set that dropped a part. An agent whose
appearance is empty gets a look derived from its id, so the roster never looks like clones.

## Rebuilding

```
npm run build:assets --workspace @tbn/client
```

The script writes every file above and prints each shell's triangle count and size and the
number of props. It throws when a default layout fails `layoutProblems`, naming what is wrong.
Change a shell or a default layout in `client/scripts/assets/packs/<name>.ts`, the props in
`client/src/game/props/furniture.ts` and `catalog.ts`, the characters in
`client/scripts/assets/characters.ts`, then rebuild and commit the files with the change.
