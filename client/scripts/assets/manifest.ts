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

/** What an idle agent goes to do at a spot. */
export type SpotKind = 'water' | 'window' | 'plant' | 'board' | 'grass' | 'stretch' | 'look';

/** A place an idle agent goes: where it stands, the way it faces, the clip it plays and how long. */
export interface Spot {
  kind: SpotKind;
  position: Vec3;
  yaw_deg: number;
  clip: string;
  seconds: number;
}

const SPOT_CLIPS: Record<SpotKind, [string, number]> = {
  water: ['drink', 4],
  window: ['look', 5],
  plant: ['look', 3],
  board: ['write', 5],
  grass: ['touch', 4],
  stretch: ['stretch', 3],
  look: ['look', 4],
};

/** A spot standing at `at` and facing `facing`, both on the floor, with its kind's clip. */
export function spot(kind: SpotKind, at: [number, number], facing: [number, number]): Spot {
  const yaw = (Math.atan2(facing[0] - at[0], facing[1] - at[1]) * 180) / Math.PI;
  const [clip, seconds] = SPOT_CLIPS[kind];
  return { kind, position: [at[0], 0, at[1]], yaw_deg: Math.round(yaw), clip, seconds };
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
  spots: Spot[];
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
    ...manifest.spots.map((place) => place.position),
    ...extra,
  ];
}
