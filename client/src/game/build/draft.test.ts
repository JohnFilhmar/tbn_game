import { describe, expect, it } from 'vitest';
import {
  commit,
  historyOf,
  newPlacement,
  redo,
  snap,
  turned,
  undo,
  withPlacement,
  withoutPlacement,
  type Draft,
} from './draft';

const EMPTY: Draft = { placements: [], theme: {} };
const ID_A = '00000000-0000-4000-8000-00000000000a';
const ID_B = '00000000-0000-4000-8000-00000000000b';

describe('the build draft', () => {
  it('places, moves, turns and removes props', () => {
    const plant = newPlacement('plant', 1.13, -2.4, ID_A);
    expect(plant).toMatchObject({ x: 1.25, z: -2.5, yaw_deg: 0, zone: null });
    const placed = withPlacement(EMPTY, plant);
    const moved = withPlacement(placed, { ...plant, x: 3 });
    expect(moved.placements).toEqual([{ ...plant, x: 3 }]);
    const turnedOnce = withPlacement(moved, turned({ ...plant, x: 3 }));
    expect(turnedOnce.placements[0]?.yaw_deg).toBe(90);
    expect(turned({ ...plant, yaw_deg: 270 }).yaw_deg).toBe(0);
    expect(withoutPlacement(turnedOnce, ID_A).placements).toEqual([]);
    expect(newPlacement('zone_rug', 0, 0, ID_B).zone).toBe(1);
    expect(snap(0.37)).toBe(0.25);
  });

  it('undoes and redoes, and a new change drops what was undone', () => {
    const first = withPlacement(EMPTY, newPlacement('desk', 0, 0, ID_A));
    const second = withPlacement(first, newPlacement('plant', 2, 2, ID_B));
    let history = commit(commit(historyOf(EMPTY), first), second);
    expect(history.present).toBe(second);

    history = undo(history);
    expect(history.present).toBe(first);
    history = undo(undo(history));
    expect(history.present).toBe(EMPTY);
    history = redo(history);
    expect(history.present).toBe(first);

    const other = { ...first, theme: { floor: '#000000' } };
    history = commit(history, other);
    expect(history.future).toEqual([]);
    expect(redo(history)).toBe(history);
  });
});
