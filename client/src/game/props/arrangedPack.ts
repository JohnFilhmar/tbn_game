import type { WorldLayout, WorldPlacement, WorldTheme } from '@tbn/contracts';
import type { LoadedPack } from '@/game/assets/packs';
import type { ComputerAnchor, PackManifest, Spot, Zone } from '@/game/assets/packManifest';
import { unreachable, walkGrid } from '@/game/world/navGrid';
import { arrange } from './arrangement';
import type { Footprint } from './builder';

/** A pack as the owner arranged it: the shell, the props, the theme, and what they make. */
export interface ArrangedPack {
  pack: LoadedPack;
  manifest: PackManifest;
  placements: WorldPlacement[];
  theme: WorldTheme;
  /** The revision of the saved layout these props came from; 0 for the pack default. */
  revision: number;
  computer: ComputerAnchor;
  zones: Zone[];
  spots: Spot[];
  footprints: Footprint[];
}

/** The spots an agent can walk to from the entry; a plant against a wall offers none. */
function reachableSpots(manifest: PackManifest, arrangement: ReturnType<typeof arrange>): Spot[] {
  const grid = walkGrid(manifest.bounds, arrangement.footprints);
  const entry = { name: 'the entry', x: manifest.entry.position[0], z: manifest.entry.position[2] };
  return arrangement.spots.filter(
    (spot) =>
      unreachable(grid, [entry, { name: 'spot', x: spot.position[0], z: spot.position[2] }])
        .length === 0,
  );
}

/**
 * A pack with its layout: the owner's saved one, or the pack's default when there is none or the
 * saved one has lost its computer. The props make the zones, the computer and the spots.
 */
export function arrangePack(pack: LoadedPack, saved: WorldLayout | null): ArrangedPack {
  const { manifest } = pack;
  const fromSaved = saved === null ? null : arrange(manifest, saved.placements);
  const isUsable = saved !== null && fromSaved !== null && fromSaved.computer !== null;
  const placements = isUsable ? saved.placements : manifest.default_layout;
  const arrangement = isUsable ? fromSaved : arrange(manifest, placements);
  const computer = arrangement.computer;
  if (computer === null) throw new Error(`The ${manifest.name} pack's default has no computer`);
  return {
    pack,
    manifest,
    placements,
    theme: saved?.theme ?? {},
    revision: saved?.revision ?? 0,
    computer,
    zones: arrangement.zones,
    spots: reachableSpots(manifest, arrangement),
    footprints: arrangement.footprints,
  };
}
