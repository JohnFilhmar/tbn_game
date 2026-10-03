import type { ClipName } from '../assets/clipNames.ts';
import type { Vec3 } from './builder.ts';

/** What an idle agent goes to a spot for. */
export type SpotKind =
  'water' | 'coffee' | 'window' | 'plant' | 'board' | 'grass' | 'rest' | 'stretch' | 'look';

/**
 * A place an idle agent wanders to: where it stands, its facing, the clip it plays and how long.
 * A spot with a seat is sat on: the agent stands at the spot, sits on the seat for the clip, and
 * steps back to the spot after, since a seat is inside its furniture's footprint.
 */
export interface SpotAnchor {
  kind: SpotKind;
  position: Vec3;
  yaw_deg: number;
  clip: ClipName;
  seconds: number;
  seat?: Vec3;
}

const SPOT_CLIPS: Record<SpotKind, [ClipName, number]> = {
  water: ['drink', 4],
  coffee: ['drink', 4],
  window: ['look', 5],
  plant: ['look', 3],
  board: ['write', 5],
  grass: ['touch', 4],
  rest: ['sit', 12],
  stretch: ['stretch', 3],
  look: ['look', 4],
};

/**
 * A spot standing at `at` and facing `facing`, both on the floor, with its kind's clip, and the
 * seat it is sat on when it has one.
 */
export function spot(
  kind: SpotKind,
  at: [number, number],
  facing: [number, number],
  seat?: [number, number],
): SpotAnchor {
  const yaw = (Math.atan2(facing[0] - at[0], facing[1] - at[1]) * 180) / Math.PI;
  const [clip, seconds] = SPOT_CLIPS[kind];
  const made: SpotAnchor = {
    kind,
    position: [at[0], 0, at[1]],
    yaw_deg: Math.round(yaw),
    clip,
    seconds,
  };
  if (seat !== undefined) made.seat = [seat[0], 0, seat[1]];
  return made;
}
