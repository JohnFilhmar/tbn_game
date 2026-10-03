import { CylinderGeometry, IcosahedronGeometry } from 'three';
import type { PackBuilder, Vec3 } from './builder.ts';

/** Where the live parts of each gadget go, in its own frame. */
export interface GadgetSpots {
  /** The middle of the tray's floor, on a desk top. */
  inboxPaper: Vec3;
  /** The cork board's middle, just in front of the cork. */
  corkFace: Vec3;
  /** The top left light of the rack's front, and the step between lights. */
  rackLight: Vec3;
  rackStep: [number, number];
  /** The clock's middle, in front of its face. */
  clockFace: Vec3;
  /** Where the first trophy stands on the shelf, and the step to the next. */
  trophyBase: Vec3;
  trophyStep: number;
}

/**
 * What `objects/LiveProps.tsx` draws from the data, on top of what the builders below make,
 * goes here.
 */
export const GADGET_SPOTS: GadgetSpots = {
  inboxPaper: [0, 0.79, 0],
  corkFace: [0, 1.55, 0.05],
  rackLight: [-0.18, 1.75, 0.36],
  rackStep: [0.12, -0.16],
  clockFace: [0, 2.35, 0.06],
  trophyBase: [-0.4, 1.52, 0.12],
  trophyStep: 0.4,
};

/** The cork board's size, for the cards pinned on it. */
export const CORK_SIZE: [number, number] = [1.2, 0.8];

/** A paper tray on a desk top, its papers drawn apart. */
export function inboxTray(b: PackBuilder): void {
  b.box('metal', [0.36, 0.02, 0.28], [0, 0.76, 0], 0, false);
  for (const side of [-1, 1]) {
    b.box('metal', [0.02, 0.06, 0.28], [side * 0.17, 0.79, 0], 0, false);
  }
  b.box('metal', [0.36, 0.06, 0.02], [0, 0.79, -0.13], 0, false);
}

/** A cork board on a wall, its back at the origin. */
export function corkBoard(b: PackBuilder): void {
  b.box('crate', [CORK_SIZE[0], CORK_SIZE[1], 0.03], [0, 1.55, 0.02], 0, false);
  b.box('wood', [CORK_SIZE[0] + 0.08, CORK_SIZE[1] + 0.08, 0.02], [0, 1.55, 0.005], 0, false);
}

/** A server rack standing on the floor, its lights drawn apart. */
export function serverRack(b: PackBuilder): void {
  b.box('device', [0.6, 2, 0.7], [0, 1, 0]);
  for (let shelf = 0; shelf < 6; shelf += 1) {
    b.box('metal', [0.52, 0.02, 0.01], [0, 0.35 + shelf * 0.3, 0.355], 0, false);
  }
}

/** A round clock on a wall, its back at the origin; the hands are drawn apart. */
export function wallClock(b: PackBuilder): void {
  const face = new CylinderGeometry(0.25, 0.25, 0.03, 16);
  face.rotateX(Math.PI / 2);
  b.add(face, 'board', [0, 2.35, 0.03]);
  const rim = new CylinderGeometry(0.28, 0.28, 0.02, 16);
  rim.rotateX(Math.PI / 2);
  b.add(rim, 'metal', [0, 2.35, 0.01]);
}

/** A beanbag on the floor. */
export function beanbag(b: PackBuilder): void {
  const bag = new IcosahedronGeometry(0.42, 1);
  bag.scale(1, 0.6, 1);
  b.add(bag, 'fabric', [0, 0.25, 0]);
  b.block({ minX: -0.4, maxX: 0.4, minZ: -0.4, maxZ: 0.4 });
}

/** A lit exit sign over a doorway, its back at the origin. */
export function exitSign(b: PackBuilder): void {
  b.box('metal', [0.5, 0.2, 0.05], [0, 2.4, 0.025], 0, false);
  b.box('plant', [0.42, 0.13, 0.01], [0, 2.4, 0.055], 0, false);
}

/** A shelf on a wall for the trophies, its back at the origin. */
export function trophyShelf(b: PackBuilder): void {
  b.box('wood', [1.2, 0.04, 0.25], [0, 1.5, 0.125], 0, false);
  for (const side of [-1, 1]) {
    b.box('metal', [0.03, 0.15, 0.2], [side * 0.5, 1.41, 0.1], 0, false);
  }
}

/** A radio on a small wall shelf, its back at the origin. */
export function radio(b: PackBuilder): void {
  b.box('wood', [0.42, 0.03, 0.22], [0, 1.2, 0.11], 0, false);
  b.box('device', [0.34, 0.2, 0.13], [0, 1.315, 0.11], 0, false);
  b.box('metal', [0.14, 0.12, 0.01], [-0.07, 1.315, 0.18], 0, false);
  b.box('accent', [0.04, 0.04, 0.02], [0.1, 1.33, 0.18], 0, false);
}
