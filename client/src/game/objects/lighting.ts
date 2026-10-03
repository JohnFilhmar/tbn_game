import type { LampMode } from '@tbn/contracts';

/** The most lamps that cast real light at once; the rest only glow. */
export const MOST_LIT_LAMPS = 8;

/** How dark the daylight gets with every blind closed, as a share of full daylight. */
const DARKEST_DAYLIGHT = 0.4;

/** True when a lamp shines: on, or on auto once the interior lights come on at dusk. */
export function isLampLit(mode: LampMode, isInteriorOn: boolean): boolean {
  return mode === 'on' || (mode === 'auto' && isInteriorOn);
}

/** A lamp as the light pool sees it: where it hangs and whether it shines. */
export interface LampSpot {
  id: string;
  x: number;
  y: number;
  z: number;
  isLit: boolean;
}

/**
 * The lit lamps nearest `from`, nearest first, at most `count`. A forward renderer pays for every
 * light on every material, so only these cast light.
 */
export function nearestLit<Lamp extends LampSpot>(
  lamps: readonly Lamp[],
  from: { x: number; y: number; z: number },
  count = MOST_LIT_LAMPS,
): Lamp[] {
  const distance = (lamp: Lamp): number =>
    (lamp.x - from.x) ** 2 + (lamp.y - from.y) ** 2 + (lamp.z - from.z) ** 2;
  return lamps
    .filter((lamp) => lamp.isLit)
    .toSorted((a, b) => distance(a) - distance(b))
    .slice(0, count);
}

/**
 * How much of the daylight comes in, from each window's blinds: 1 with all open, down to 0.4 with
 * all closed. A pack with no blinds keeps all of it.
 */
export function daylightScale(blindsOpen: readonly boolean[]): number {
  if (blindsOpen.length === 0) return 1;
  const closed = blindsOpen.filter((isOpen) => !isOpen).length / blindsOpen.length;
  return 1 - (1 - DARKEST_DAYLIGHT) * closed;
}
