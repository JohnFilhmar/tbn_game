import { Vector3 } from 'three';
import { forwardOf, vec3 } from '@/game/assets/geometry';
import type { ComputerAnchor } from '@/game/assets/packManifest';

/** Where the camera and the owner are while the owner sits at the computer. */
export interface SeatPose {
  /** The camera's place: in front of the screen, at its height. */
  eye: Vector3;
  /** The middle of the screen, where the camera looks. */
  look: Vector3;
  /** The chair on the floor, where the owner's character sits. */
  chair: Vector3;
  /** The way the seated owner faces. */
  yawDeg: number;
}

/** How far the eye sits from the screen: the monitor then fills most of the view. */
const EYE_DISTANCE = 0.55;
/** From the screen back to the chair: the screen sits 0.18 m ahead of the desk's middle, and the
 * chair 0.95 m behind it, as `client/scripts/assets/furniture.ts` builds the owner's desk. */
const CHAIR_DISTANCE = 1.13;

/** True on every route but the world itself: sign in and the desk are the owner at the monitor. */
export function isSeatedPath(pathname: string): boolean {
  return pathname !== '/';
}

/** The seated pose at a pack's computer, whose yaw is the way its user faces. */
export function seatPoseOf(computer: ComputerAnchor): SeatPose {
  const screen = vec3(computer.position);
  const [forwardX, forwardZ] = forwardOf(computer.yaw_deg);
  return {
    eye: new Vector3(
      screen.x - forwardX * EYE_DISTANCE,
      screen.y,
      screen.z - forwardZ * EYE_DISTANCE,
    ),
    look: screen,
    chair: new Vector3(
      screen.x - forwardX * CHAIR_DISTANCE,
      0,
      screen.z - forwardZ * CHAIR_DISTANCE,
    ),
    yawDeg: computer.yaw_deg,
  };
}

/**
 * Where a teleport to someone lands: `distance` metres from them on the floor, on the side the
 * owner comes from, or in front of them when the owner is already on top of them.
 */
export function landingBeside(target: Vector3, from: Vector3, distance = 1.2): Vector3 {
  const dx = from.x - target.x;
  const dz = from.z - target.z;
  const length = Math.hypot(dx, dz);
  if (length < 0.01) return new Vector3(target.x, 0, target.z + distance);
  return new Vector3(target.x + (dx / length) * distance, 0, target.z + (dz / length) * distance);
}
