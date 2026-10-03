import type { WorldPlacement } from '@tbn/contracts';
import { describe, expect, it } from 'vitest';
import { PACKS } from '@/game/assets/packs';
import { newPlacement } from '@/game/build/draft';
import { nearestFit } from '@/game/build/placing';
import { layoutProblems, placementProblem } from './layoutProblems';

const { manifest } = PACKS.office;
const defaults = manifest.default_layout;

function at(kind: WorldPlacement['kind'], x: number, z: number, n: number): WorldPlacement {
  return newPlacement(kind, x, z, `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`);
}

describe('a layout', () => {
  it('ships every pack with a default an owner could save', () => {
    for (const pack of Object.values(PACKS)) {
      expect(
        layoutProblems(pack.manifest.bounds, pack.manifest, pack.manifest.default_layout),
      ).toEqual([]);
    }
  });

  it('refuses a prop on top of another, in a wall, or off the floor', () => {
    const desk = defaults.find((one) => one.kind === 'desk');
    if (desk === undefined) throw new Error('The office has desks');
    expect(
      placementProblem(manifest.bounds, manifest, at('plant', desk.x, desk.z, 9001), defaults),
    ).toBe('The pot plant is on top of a desk.');
    expect(placementProblem(manifest.bounds, manifest, at('plant', -11, 0, 9002), defaults)).toBe(
      'The pot plant is in a wall.',
    );
    expect(placementProblem(manifest.bounds, manifest, at('plant', 30, 0, 9003), defaults)).toBe(
      'The pot plant is off the floor.',
    );
    expect(
      placementProblem(manifest.bounds, manifest, at('plant', 0, 3.5, 9004), defaults),
    ).toBeNull();
  });

  it('names what a prop in the doorway cuts off, and wants exactly one computer', () => {
    const doorway = [...defaults, at('plant', 0, 7.5, 9005)];
    expect(layoutProblems(manifest.bounds, manifest, doorway)).toContain('The entry is blocked.');
    const noComputer = defaults.filter((one) => one.kind !== 'computer_desk');
    expect(layoutProblems(manifest.bounds, manifest, noComputer)).toContain(
      'The office needs exactly one computer of yours.',
    );
  });

  it('moves a new prop to the nearest spot where it fits and cuts nothing off', () => {
    const desk = defaults.find((one) => one.kind === 'desk');
    if (desk === undefined) throw new Error('The office has desks');
    const moved = nearestFit(
      manifest.bounds,
      manifest,
      at('plant', desk.x, desk.z, 9006),
      defaults,
    );
    expect(placementProblem(manifest.bounds, manifest, moved, defaults)).toBeNull();
    expect(layoutProblems(manifest.bounds, manifest, [...defaults, moved])).toEqual([]);
    expect(Math.hypot(moved.x - desk.x, moved.z - desk.z)).toBeLessThan(3);
  });
});
