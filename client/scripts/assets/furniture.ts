import { CylinderGeometry, IcosahedronGeometry, SphereGeometry } from 'three';
import {
  ahead,
  forwardOf,
  type Anchor,
  type DeskAnchor,
  type PackBuilder,
  type Vec3,
} from './kit.ts';

/** Every material a pack may use, with the colours the packs start from. */
export const BASE_MATERIALS: Record<string, string> = {
  floor: '#b9b1a3',
  wall: '#e9e4da',
  wood: '#b07c4f',
  metal: '#8c9099',
  fabric: '#4f6d8f',
  plant: '#4f8f4a',
  pot: '#8a5a3c',
  screen: '#1d2a3a',
  device: '#2f3340',
  crate: '#c89a5c',
  accent: '#e0a23a',
  glass: '#a9d3e6',
  partition: '#c9c3b7',
  board: '#f4f4f2',
  counter: '#d9d4cc',
  fence: '#b89b7a',
  grass: '#6fa85a',
  light: '#fff6dc',
  concrete: '#9a9a9a',
  frame: '#5a5e66',
};

/** How far behind a desk's centre its sitter sits. */
export const SEAT_DISTANCE = 0.95;

/** The height of a desk top. */
const DESK_HEIGHT = 0.74;

function chair(b: PackBuilder, seat: Vec3, yawDeg: number): void {
  b.box('fabric', [0.46, 0.06, 0.46], [seat[0], 0.44, seat[2]], yawDeg, false);
  const back = ahead(seat, yawDeg, -0.2);
  b.box('fabric', [0.46, 0.46, 0.06], [back[0], 0.7, back[2]], yawDeg, false);
  b.add(new CylinderGeometry(0.03, 0.03, 0.4, 8), 'metal', [seat[0], 0.2, seat[2]]);
  b.add(new CylinderGeometry(0.22, 0.22, 0.03, 10), 'metal', [seat[0], 0.015, seat[2]]);
}

function laptop(b: PackBuilder, at: Vec3, yawDeg: number): void {
  b.box('device', [0.34, 0.02, 0.24], [at[0], at[1] + 0.01, at[2]], yawDeg, false);
  const hinge = ahead(at, yawDeg, 0.11);
  b.box('screen', [0.34, 0.22, 0.015], [hinge[0], at[1] + 0.12, hinge[2]], yawDeg, false);
}

/** A desk with a laptop and a chair behind it. The sitter faces `yawDeg`, toward the desk. */
export function desk(
  b: PackBuilder,
  centre: [number, number],
  yawDeg: number,
  options: { width?: number; depth?: number; laptop?: boolean } = {},
): DeskAnchor {
  const width = options.width ?? 1.4;
  const depth = options.depth ?? 0.7;
  const top: Vec3 = [centre[0], DESK_HEIGHT, centre[1]];
  b.box('wood', [width, 0.05, depth], top, yawDeg);
  const [dx, dz] = forwardOf(yawDeg);
  const legOffsets: [number, number][] = [
    [width / 2 - 0.06, depth / 2 - 0.06],
    [-(width / 2 - 0.06), depth / 2 - 0.06],
    [width / 2 - 0.06, -(depth / 2 - 0.06)],
    [-(width / 2 - 0.06), -(depth / 2 - 0.06)],
  ];
  for (const [lx, lz] of legOffsets) {
    const x = centre[0] + lx * dz + lz * dx;
    const z = centre[1] - lx * dx + lz * dz;
    b.box(
      'metal',
      [0.05, DESK_HEIGHT - 0.05, 0.05],
      [x, (DESK_HEIGHT - 0.05) / 2, z],
      yawDeg,
      false,
    );
  }
  if (options.laptop !== false) laptop(b, [top[0], DESK_HEIGHT + 0.025, top[2]], yawDeg);
  const seat = ahead([centre[0], 0, centre[1]], yawDeg, -SEAT_DISTANCE);
  chair(b, seat, yawDeg);
  return { position: top, yaw_deg: yawDeg, seat };
}

/** The anchor of the in-world computer: where its screen is and the direction to face it. */
export interface ComputerAnchor extends Anchor {
  use_radius: number;
}

/** A desk with a monitor and a keyboard instead of a laptop: the owner's computer. */
export function computerDesk(
  b: PackBuilder,
  centre: [number, number],
  yawDeg: number,
): { desk: DeskAnchor; computer: ComputerAnchor } {
  const anchor = desk(b, centre, yawDeg, { width: 1.6, depth: 0.8, laptop: false });
  const screenAt = ahead([centre[0], DESK_HEIGHT, centre[1]], yawDeg, 0.18);
  b.box('metal', [0.1, 0.22, 0.1], [screenAt[0], DESK_HEIGHT + 0.13, screenAt[2]], yawDeg, false);
  b.box(
    'device',
    [0.66, 0.42, 0.04],
    [screenAt[0], DESK_HEIGHT + 0.45, screenAt[2]],
    yawDeg,
    false,
  );
  const front = ahead(screenAt, yawDeg, -0.025);
  b.box('screen', [0.6, 0.36, 0.01], [front[0], DESK_HEIGHT + 0.45, front[2]], yawDeg, false);
  const keyboard = ahead([centre[0], DESK_HEIGHT + 0.035, centre[1]], yawDeg, -0.18);
  b.box('device', [0.42, 0.02, 0.14], keyboard, yawDeg, false);
  return {
    desk: anchor,
    computer: {
      position: [screenAt[0], DESK_HEIGHT + 0.45, screenAt[2]],
      yaw_deg: yawDeg,
      use_radius: 1.9,
    },
  };
}

/** A table with a seat on each side, each with a laptop: four desk anchors around one top. */
export function tableSeats(
  b: PackBuilder,
  centre: [number, number],
  yawDeg: number,
  size: [number, number],
  material = 'wood',
): DeskAnchor[] {
  const [width, depth] = size;
  b.box(material, [width, 0.05, depth], [centre[0], DESK_HEIGHT, centre[1]], yawDeg);
  const [dx, dz] = forwardOf(yawDeg);
  const legOffsets: [number, number][] = [
    [width / 2 - 0.08, depth / 2 - 0.08],
    [-(width / 2 - 0.08), depth / 2 - 0.08],
    [width / 2 - 0.08, -(depth / 2 - 0.08)],
    [-(width / 2 - 0.08), -(depth / 2 - 0.08)],
  ];
  for (const [lx, lz] of legOffsets) {
    const x = centre[0] + lx * dz + lz * dx;
    const z = centre[1] - lx * dx + lz * dz;
    b.box(
      'metal',
      [0.06, DESK_HEIGHT - 0.05, 0.06],
      [x, (DESK_HEIGHT - 0.05) / 2, z],
      yawDeg,
      false,
    );
  }
  const anchors: DeskAnchor[] = [];
  for (let side = 0; side < 4; side += 1) {
    const yaw = yawDeg + side * 90;
    const halfExtent = side % 2 === 0 ? depth / 2 : width / 2;
    const seat = ahead([centre[0], 0, centre[1]], yaw, -(halfExtent + 0.6));
    const work = ahead([centre[0], DESK_HEIGHT, centre[1]], yaw, -(halfExtent - 0.22));
    laptop(b, [work[0], DESK_HEIGHT + 0.025, work[2]], yaw);
    chair(b, seat, yaw);
    anchors.push({ position: work, yaw_deg: yaw, seat });
  }
  return anchors;
}

/** A low wall between desks. */
export function partition(
  b: PackBuilder,
  from: [number, number],
  to: [number, number],
  height = 1.2,
): void {
  b.wall('partition', from, to, height, 0.08);
}

/** A pot plant. */
export function plant(b: PackBuilder, at: [number, number]): void {
  b.cylinder('pot', 0.22, 0.4, [at[0], 0, at[1]]);
  b.add(new IcosahedronGeometry(0.42, 1), 'plant', [at[0], 0.85, at[1]]);
}

/** A tree: a trunk and a round crown. */
export function tree(b: PackBuilder, at: [number, number], height = 2.6): void {
  b.cylinder('wood', 0.16, height * 0.45, [at[0], 0, at[1]]);
  b.add(new SphereGeometry(height * 0.32, 8, 6), 'plant', [at[0], height * 0.7, at[1]]);
}

/** A sofa facing `yawDeg`. */
export function sofa(b: PackBuilder, centre: [number, number], yawDeg: number, width = 2): void {
  b.box('fabric', [width, 0.42, 0.85], [centre[0], 0.21, centre[1]], yawDeg);
  const back = ahead([centre[0], 0.62, centre[1]], yawDeg, -0.3);
  b.box('fabric', [width, 0.42, 0.25], back, yawDeg, false);
  const [dx, dz] = forwardOf(yawDeg);
  for (const sign of [1, -1]) {
    const x = centre[0] + sign * (width / 2 - 0.1) * dz;
    const z = centre[1] - sign * (width / 2 - 0.1) * dx;
    b.box('fabric', [0.2, 0.3, 0.85], [x, 0.57, z], yawDeg, false);
  }
}

/** A low table, such as a coffee table. */
export function lowTable(
  b: PackBuilder,
  centre: [number, number],
  yawDeg: number,
  size: [number, number],
): void {
  b.box('wood', [size[0], 0.04, size[1]], [centre[0], 0.42, centre[1]], yawDeg);
  const [dx, dz] = forwardOf(yawDeg);
  const legOffsets: [number, number][] = [
    [size[0] / 2 - 0.05, size[1] / 2 - 0.05],
    [-(size[0] / 2 - 0.05), size[1] / 2 - 0.05],
    [size[0] / 2 - 0.05, -(size[1] / 2 - 0.05)],
    [-(size[0] / 2 - 0.05), -(size[1] / 2 - 0.05)],
  ];
  for (const [lx, lz] of legOffsets) {
    const x = centre[0] + lx * dz + lz * dx;
    const z = centre[1] - lx * dx + lz * dz;
    b.box('wood', [0.05, 0.4, 0.05], [x, 0.2, z], yawDeg, false);
  }
}

/** A shelving unit of `length` metres along its yaw, with crates on its planks. */
export function shelfUnit(
  b: PackBuilder,
  centre: [number, number],
  yawDeg: number,
  length: number,
  options: { depth?: number; height?: number; levels?: number } = {},
): void {
  const depth = options.depth ?? 1;
  const height = options.height ?? 2.6;
  const levels = options.levels ?? 3;
  const [dx, dz] = forwardOf(yawDeg);
  const along = (t: number, across: number): [number, number] => [
    centre[0] + t * dx + across * dz,
    centre[1] + t * dz - across * dx,
  ];
  b.block({
    minX: Math.min(
      ...[-length / 2, length / 2].map((t) =>
        Math.min(along(t, -depth / 2)[0], along(t, depth / 2)[0]),
      ),
    ),
    maxX: Math.max(
      ...[-length / 2, length / 2].map((t) =>
        Math.max(along(t, -depth / 2)[0], along(t, depth / 2)[0]),
      ),
    ),
    minZ: Math.min(
      ...[-length / 2, length / 2].map((t) =>
        Math.min(along(t, -depth / 2)[1], along(t, depth / 2)[1]),
      ),
    ),
    maxZ: Math.max(
      ...[-length / 2, length / 2].map((t) =>
        Math.max(along(t, -depth / 2)[1], along(t, depth / 2)[1]),
      ),
    ),
  });
  const uprights = Math.max(2, Math.round(length / 2) + 1);
  for (let index = 0; index < uprights; index += 1) {
    const t = -length / 2 + (index * length) / (uprights - 1);
    for (const across of [-depth / 2 + 0.04, depth / 2 - 0.04]) {
      const [x, z] = along(t, across);
      b.box('frame', [0.08, height, 0.08], [x, height / 2, z], yawDeg, false);
    }
  }
  for (let level = 0; level < levels; level += 1) {
    const y = 0.15 + (level * (height - 0.4)) / (levels - 1);
    b.box('wood', [depth, 0.05, length], [centre[0], y, centre[1]], yawDeg, false);
    const crates = Math.floor(length / 1.2);
    for (let index = 0; index < crates; index += 1) {
      if ((index + level) % 3 === 2) continue;
      const t = -length / 2 + 0.6 + index * 1.2;
      const [x, z] = along(t, 0);
      const size = 0.45 + ((index + level) % 2) * 0.12;
      b.box('crate', [size, size, size], [x, y + 0.025 + size / 2, z], yawDeg, false);
    }
  }
}

/** A pallet with a crate on it. */
export function pallet(b: PackBuilder, at: [number, number], yawDeg = 0): void {
  b.box('wood', [1.2, 0.14, 1], [at[0], 0.07, at[1]], yawDeg);
  b.box('crate', [0.8, 0.7, 0.8], [at[0], 0.49, at[1]], yawDeg, false);
}

/** A kitchen counter run along its yaw. */
export function counter(
  b: PackBuilder,
  centre: [number, number],
  yawDeg: number,
  length: number,
): void {
  b.box('counter', [0.6, 0.88, length], [centre[0], 0.44, centre[1]], yawDeg);
  b.box('metal', [0.62, 0.04, length + 0.02], [centre[0], 0.9, centre[1]], yawDeg, false);
}

/** A fridge. */
export function fridge(b: PackBuilder, at: [number, number], yawDeg: number): void {
  b.box('metal', [0.8, 1.9, 0.7], [at[0], 0.95, at[1]], yawDeg);
}

/** A water cooler. */
export function waterCooler(b: PackBuilder, at: [number, number]): void {
  b.box('device', [0.36, 1, 0.36], [at[0], 0.5, at[1]]);
  b.add(new CylinderGeometry(0.15, 0.15, 0.4, 10), 'glass', [at[0], 1.2, at[1]]);
}

/** A whiteboard on a wall, facing `yawDeg`. */
export function whiteboard(b: PackBuilder, centre: [number, number], yawDeg: number): void {
  b.box('board', [1.8, 1.1, 0.05], [centre[0], 1.6, centre[1]], yawDeg, false);
  b.box(
    'frame',
    [1.86, 1.16, 0.03],
    ahead([centre[0], 1.6, centre[1]], yawDeg, -0.02),
    yawDeg,
    false,
  );
}

/** A rug or any flat floor patch, walkable. */
export function rug(
  b: PackBuilder,
  centre: [number, number],
  size: [number, number],
  material: string,
): void {
  b.floor(material, size[0], size[1], [centre[0], 0.005, centre[1]]);
}

/** A window pane set on a wall's inner face. */
export function windowPane(
  b: PackBuilder,
  centre: [number, number],
  yawDeg: number,
  width = 1.6,
): void {
  b.box('glass', [width, 1.3, 0.04], [centre[0], 1.65, centre[1]], yawDeg, false);
  b.box(
    'frame',
    [width + 0.08, 1.38, 0.03],
    ahead([centre[0], 1.65, centre[1]], yawDeg, -0.02),
    yawDeg,
    false,
  );
}

/** A ceiling light fixture; the manifest carries the light itself. */
export function lamp(b: PackBuilder, at: [number, number], height: number): void {
  b.box('light', [0.7, 0.05, 0.7], [at[0], height - 0.03, at[1]], 0, false);
}

/** A forklift standing still. */
export function forklift(b: PackBuilder, centre: [number, number], yawDeg: number): void {
  b.box('accent', [1, 0.9, 1.7], [centre[0], 0.6, centre[1]], yawDeg);
  const mast = ahead([centre[0], 1.2, centre[1]], yawDeg, 1);
  b.box('metal', [0.9, 2.2, 0.1], mast, yawDeg, false);
  const [dx, dz] = forwardOf(yawDeg);
  for (const sign of [1, -1]) {
    const fork = ahead(
      [centre[0] + sign * 0.25 * dz, 0.1, centre[1] - sign * 0.25 * dx],
      yawDeg,
      1.5,
    );
    b.box('metal', [0.1, 0.05, 1], fork, yawDeg, false);
  }
  b.box('frame', [1.1, 0.3, 0.9], [centre[0], 1.65, centre[1]], yawDeg, false);
}

/** A low fence. */
export function fence(b: PackBuilder, from: [number, number], to: [number, number]): void {
  b.wall('fence', from, to, 1, 0.08);
}

/** A door frame around a gap in a wall, facing `yawDeg`. */
export function doorFrame(
  b: PackBuilder,
  centre: [number, number],
  yawDeg: number,
  width: number,
): void {
  const [dx, dz] = forwardOf(yawDeg);
  for (const sign of [1, -1]) {
    const x = centre[0] + sign * (width / 2 + 0.05) * dz;
    const z = centre[1] - sign * (width / 2 + 0.05) * dx;
    b.box('frame', [0.1, 2.2, 0.26], [x, 1.1, z], yawDeg, false);
  }
  b.box('frame', [width + 0.2, 0.1, 0.26], [centre[0], 2.25, centre[1]], yawDeg, false);
}
