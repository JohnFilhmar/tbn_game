import type { WorldPlacement } from '@tbn/contracts';
import { Vector3 } from 'three';
import { forwardOf } from '@/game/assets/geometry';
import { toWorld } from '@/game/props/arrangement';
import { BOARD_ASPECT, BOARD_HEIGHT } from './draw';

/** The height of the board's middle and how far its face stands off the wall, in metres. */
const BOARD_CENTRE = 1.6;
const BOARD_FACE = 0.03;
/** The most of the screen's height the board takes while the owner draws. */
const MOST_SHARE = 0.6;

/** The drawing canvas in pixels, and the share of the screen's height the board fills. */
export interface BoardFrame {
  width: number;
  height: number;
  share: number;
}

/** How big the drawing canvas is on a screen, so the board's projection fills it exactly. */
export function boardFrame(viewportWidth: number, viewportHeight: number): BoardFrame {
  const share = Math.min(MOST_SHARE, (0.92 * viewportWidth) / (viewportHeight * BOARD_ASPECT));
  const height = share * viewportHeight;
  return { width: height * BOARD_ASPECT, height, share };
}

/** Where the camera stands and looks while the owner draws on a board. */
export interface BoardPose {
  eye: Vector3;
  look: Vector3;
}

/**
 * The camera square onto a board, at the distance where the board fills `share` of the screen's
 * height through a lens of `fovDeg`, so the canvas over it lines up with the board.
 */
export function boardPoseOf(
  placement: Pick<WorldPlacement, 'x' | 'z' | 'yaw_deg'>,
  share: number,
  fovDeg: number,
): BoardPose {
  const [x, , z] = toWorld(placement, [0, 0, BOARD_FACE]);
  const distance = BOARD_HEIGHT / 2 / (Math.tan((fovDeg * Math.PI) / 360) * share);
  const [forwardX, forwardZ] = forwardOf(placement.yaw_deg);
  return {
    look: new Vector3(x, BOARD_CENTRE, z),
    eye: new Vector3(x + forwardX * distance, BOARD_CENTRE, z + forwardZ * distance),
  };
}
