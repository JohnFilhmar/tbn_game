import { Vector3 } from 'three';
import type { Vec3 } from './packManifest';

const DEG = Math.PI / 180;

/** A `Vector3` from a manifest position. */
export function vec3(position: Vec3): Vector3 {
  return new Vector3(position[0], position[1], position[2]);
}

/** Radians from a yaw in degrees. */
export function radiansOf(yawDeg: number): number {
  return yawDeg * DEG;
}

/** The unit direction on the floor a yaw faces: yaw 0 is +Z, yaw 90 is +X. */
export function forwardOf(yawDeg: number): [number, number] {
  return [Math.sin(yawDeg * DEG), Math.cos(yawDeg * DEG)];
}

/** The yaw in degrees that faces from `from` towards `to` on the floor. */
export function yawTowards(from: Vector3, to: Vector3): number {
  return Math.atan2(to.x - from.x, to.z - from.z) / DEG;
}

/** The distance on the floor, ignoring height. */
export function distanceXz(a: Vector3, b: Vector3): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/** The shortest turn from `fromDeg` to `toDeg`, in degrees within (-180, 180]. */
export function turnBetween(fromDeg: number, toDeg: number): number {
  let delta = (toDeg - fromDeg) % 360;
  if (delta > 180) delta -= 360;
  if (delta <= -180) delta += 360;
  return delta;
}

/** Turns `fromDeg` towards `toDeg` by at most `maxDeg`, taking the shorter way round. */
export function turnTowards(fromDeg: number, toDeg: number, maxDeg: number): number {
  const delta = turnBetween(fromDeg, toDeg);
  if (Math.abs(delta) <= maxDeg) return toDeg;
  return fromDeg + Math.sign(delta) * maxDeg;
}
