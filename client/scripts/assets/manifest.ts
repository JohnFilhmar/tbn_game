import type { PropKind, WorldPlacement } from '@tbn/contracts';
import type { Group } from 'three';
import type { Anchor, Bounds, Footprint, Vec3 } from '#game/props/builder.ts';
import type { SpotAnchor } from '#game/props/catalog.ts';

export { spot } from '#game/props/catalog.ts';

/** A light inside the pack, on from dusk. */
export interface InteriorLight {
  position: Vec3;
  color: string;
  intensity: number;
  distance: number;
}

/** The pack's lighting profile; the time of day supplies the sun and the sky. */
export interface Lighting {
  ambient: string;
  sun_azimuth_deg: number;
  interior: InteriorLight[];
}

/** What `manifest.json` holds, as `docs/assets.md` describes it. */
export interface PackManifest {
  name: string;
  title: string;
  scale: number;
  scene: string;
  bounds: Bounds;
  ceiling: number;
  spawn: Anchor;
  entry: Anchor;
  exit: Anchor;
  waiting: Anchor[];
  /** The shell's own spots; every prop brings its own. */
  spots: SpotAnchor[];
  /** The floor the shell's walls block. */
  blocks: Footprint[];
  lighting: Lighting;
  /** The props the pack starts with, until the owner saves a layout of their own. */
  default_layout: WorldPlacement[];
}

/** A built pack, before its files are written. */
export interface PackResult {
  manifest: Omit<PackManifest, 'scene'>;
  scene: Group;
}

/** Extra settings of one placement in a default layout. */
export interface PlacementOptions {
  width?: number;
  depth?: number;
  zone?: number;
  variant?: string;
}

/**
 * Collects a pack's default layout. Ids are fixed per pack and position in the list, so a
 * rebuilt pack keeps them and the layout's order, which decides who gets which desk.
 */
export class LayoutBuilder {
  readonly placements: WorldPlacement[] = [];
  private readonly pack: number;

  /** `pack` is a number per pack, which keeps ids unique across packs. */
  constructor(pack: number) {
    this.pack = pack;
  }

  /** Places a prop of `kind` at (`x`, `z`), facing `yawDeg`. */
  add(kind: PropKind, x: number, z: number, yawDeg = 0, options: PlacementOptions = {}): void {
    const serial = (this.pack * 1000 + this.placements.length + 1).toString(16).padStart(12, '0');
    this.placements.push({
      id: `00000000-0000-4000-8000-${serial}`,
      kind,
      x,
      z,
      yaw_deg: yawDeg,
      width: options.width ?? null,
      depth: options.depth ?? null,
      zone: options.zone ?? null,
      variant: options.variant ?? null,
      color: null,
    });
  }
}
