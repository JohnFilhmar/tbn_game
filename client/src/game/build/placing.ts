import type { WorldPlacement } from '@tbn/contracts';
import type { ShellAnchors } from '@/game/props/arrangement';
import { layoutProblems, placementProblem } from '@/game/props/layoutProblems';
import type { Bounds } from '@/game/world/navGrid';
import { useBuildStore } from './buildStore';
import { GRID, withPlacement } from './draft';

/** How far from the wanted point a free spot is looked for, in grid steps. */
const SEARCH_STEPS = 24;

/**
 * The placement moved to the nearest point, from where it is, at which it fits: nothing under
 * it and nothing it cuts off. The point itself when it already fits, and unchanged when nothing
 * nearby does.
 */
export function nearestFit(
  bounds: Bounds,
  shell: ShellAnchors,
  placement: WorldPlacement,
  others: readonly WorldPlacement[],
): WorldPlacement {
  const before = layoutProblems(bounds, shell, others).length;
  for (let ring = 0; ring <= SEARCH_STEPS; ring += 1) {
    for (let i = -ring; i <= ring; i += 1) {
      for (let j = -ring; j <= ring; j += 1) {
        if (Math.max(Math.abs(i), Math.abs(j)) !== ring) continue;
        const candidate = { ...placement, x: placement.x + i * GRID, z: placement.z + j * GRID };
        if (placementProblem(bounds, shell, candidate, others) !== null) continue;
        if (layoutProblems(bounds, shell, [...others, candidate]).length <= before)
          return candidate;
      }
    }
  }
  return placement;
}

/** Drops the held prop where it is, when it fits there. True when it was dropped. */
export function dropHeld(bounds: Bounds, shell: ShellAnchors): boolean {
  const state = useBuildStore.getState();
  const held = state.holding;
  const others = state.history?.present.placements ?? [];
  if (held === null || placementProblem(bounds, shell, held, others) !== null) return false;
  state.change((present) => withPlacement(present, held));
  state.hold(null);
  state.select(held.id);
  return true;
}
