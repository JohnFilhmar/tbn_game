import { describe, expect, it } from 'vitest';
import { daylightScale, isLampLit, nearestLit, type LampSpot } from './lighting';

function lamp(id: string, x: number, isLit = true): LampSpot {
  return { id, x, y: 2.7, z: 0, isLit };
}

describe('the lamps', () => {
  it('shine on, or on auto once the interior lights come on', () => {
    expect(isLampLit('on', false)).toBe(true);
    expect(isLampLit('off', true)).toBe(false);
    expect(isLampLit('auto', true)).toBe(true);
    expect(isLampLit('auto', false)).toBe(false);
  });

  it('cast real light from the eight nearest lit ones only', () => {
    const lamps = Array.from({ length: 12 }, (_, index) => lamp(`l${index}`, index * 2));
    lamps.push(lamp('dark', 0.5, false));
    const chosen = nearestLit(lamps, { x: 0, y: 1.6, z: 0 });
    expect(chosen.map((one) => one.id)).toEqual(['l0', 'l1', 'l2', 'l3', 'l4', 'l5', 'l6', 'l7']);
    expect(nearestLit(lamps, { x: 22, y: 1.6, z: 0 }, 2).map((one) => one.id)).toEqual([
      'l11',
      'l10',
    ]);
  });
});

describe('the blinds', () => {
  it('scale the daylight with the share of windows closed, down to 40 percent', () => {
    expect(daylightScale([])).toBe(1);
    expect(daylightScale([true, true])).toBe(1);
    expect(daylightScale([false, true])).toBeCloseTo(0.7);
    expect(daylightScale([false, false, false])).toBeCloseTo(0.4);
  });
});
