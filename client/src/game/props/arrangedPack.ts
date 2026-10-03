import type { WorldLayout, WorldPlacement, WorldTheme } from '@tbn/contracts';
import type { LoadedPack } from '@/game/assets/packs';
import type { ComputerAnchor, PackManifest, Spot, Zone } from '@/game/assets/packManifest';
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
    spots: arrangement.spots,
    footprints: arrangement.footprints,
  };
}
