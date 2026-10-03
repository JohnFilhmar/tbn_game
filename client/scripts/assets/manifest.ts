import type { BufferGeometry, Group } from 'three';
import type { ComputerAnchor } from './furniture.ts';
import type { Anchor, Bounds, DeskAnchor, Vec3 } from './kit.ts';

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

/** A department's zone: its desks, the manager's first. */
export interface Zone {
  name: string;
  label: string;
  desks: DeskAnchor[];
}

/** What `manifest.json` holds, as `docs/assets.md` describes it. */
export interface PackManifest {
  name: string;
  title: string;
  scale: number;
  scene: string;
  navmesh: string;
  bounds: Bounds;
  ceiling: number;
  spawn: Anchor;
  entry: Anchor;
  exit: Anchor;
  computer: ComputerAnchor;
  zones: Zone[];
  waiting: Anchor[];
  lighting: Lighting;
}

/** A built pack, before its files are written. */
export interface PackResult {
  manifest: Omit<PackManifest, 'scene' | 'navmesh'>;
  scene: Group;
  navmesh: BufferGeometry;
}

/** The anchors a navmesh must reach: every seat and every place someone stands. */
export function anchorsOf(
  manifest: Omit<PackManifest, 'scene' | 'navmesh'>,
  extra: Vec3[],
): Vec3[] {
  return [
    manifest.entry.position,
    manifest.exit.position,
    manifest.spawn.position,
    ...manifest.zones.flatMap((zone) => zone.desks.map((desk) => desk.seat)),
    ...manifest.waiting.map((anchor) => anchor.position),
    ...extra,
  ];
}
