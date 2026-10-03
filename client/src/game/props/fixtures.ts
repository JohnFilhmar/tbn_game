import { ConeGeometry } from 'three';
import type { PackBuilder } from './builder.ts';

/** A lamp variant: how high its shade hangs, how far its cord climbs, and the light it gives. */
export interface LampVariant {
  height: number;
  cord: number;
  color: string;
  intensity: number;
  distance: number;
}

const PANEL: LampVariant = { height: 2.7, cord: 0.3, color: '#fff1d6', intensity: 7, distance: 10 };

/** The lamps: a panel for a room, a high bay for a warehouse. */
const LAMP_VARIANTS: Record<string, LampVariant> = {
  panel: PANEL,
  high_bay: { height: 5.2, cord: 0.8, color: '#f3f7ff', intensity: 16, distance: 16 },
};

/** A lamp's variant, the panel when the name is unknown. */
export function lampVariant(name: string): LampVariant {
  return LAMP_VARIANTS[name] ?? PANEL;
}

/** The top of a window's glass, where blinds hang from, and how far down they reach. */
export const BLINDS_TOP = 2.3;
export const BLINDS_DROP = 1.3;

/** A cabinet with a coffee machine and two cups on it. */
export function coffeeSet(b: PackBuilder): void {
  b.box('wood', [1, 0.9, 0.55], [0, 0.45, 0]);
  b.box('device', [0.32, 0.42, 0.3], [-0.22, 1.11, -0.06], 0, false);
  b.box('metal', [0.2, 0.03, 0.12], [-0.22, 0.915, 0.12], 0, false);
  b.cylinder('board', 0.045, 0.1, [0.16, 0.9, 0.06], false);
  b.cylinder('board', 0.045, 0.1, [0.32, 0.9, -0.08], false);
}

/** The rail window blinds hang from; the slats are drawn apart, since they move. */
export function blindsRail(b: PackBuilder, width: number): void {
  b.box('metal', [width + 0.1, 0.06, 0.08], [0, BLINDS_TOP + 0.06, 0], 0, false);
}

/** A ceiling lamp's cord and rim; its shade is drawn apart, since it lights up. */
export function lampFixture(b: PackBuilder, variant: string): void {
  const hang = lampVariant(variant);
  b.box('metal', [0.02, hang.cord, 0.02], [0, hang.height + 0.04 + hang.cord / 2, 0], 0, false);
  b.box('metal', [0.74, 0.02, 0.74], [0, hang.height + 0.035, 0], 0, false);
}

/** A light switch panel on a wall, its back at the origin. */
export function lightSwitch(b: PackBuilder): void {
  b.box('board', [0.16, 0.22, 0.03], [0, 1.25, 0.015], 0, false);
  b.box('accent', [0.05, 0.08, 0.02], [0, 1.25, 0.035], 0, false);
}

const TUFTS: [number, number][] = [
  [-0.3, -0.25],
  [0.25, -0.35],
  [0.05, 0.1],
  [-0.4, 0.35],
  [0.4, 0.3],
  [-0.1, -0.5],
];

/** A patch of turf with a few tufts, walkable. */
export function grassPatch(b: PackBuilder, width: number, depth: number): void {
  b.floor('grass', width, depth, [0, 0.015, 0]);
  for (const [x, z] of TUFTS) {
    b.add(new ConeGeometry(0.06, 0.2, 4), 'plant', [(x * width) / 1.2, 0.115, (z * depth) / 1.2]);
  }
}
