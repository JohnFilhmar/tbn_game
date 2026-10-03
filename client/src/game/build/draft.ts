import type { PropKind, WorldPlacement, WorldTheme } from '@tbn/contracts';

/** A layout being built: the props and the theme, before they are saved. */
export interface Draft {
  placements: WorldPlacement[];
  theme: WorldTheme;
}

/** Every draft the owner can step back or forward to, with the one shown now. */
export interface History {
  past: Draft[];
  present: Draft;
  future: Draft[];
}

/** How far back undo reaches. */
const MOST_UNDO = 100;

/** A history that starts at `draft`. */
export function historyOf(draft: Draft): History {
  return { past: [], present: draft, future: [] };
}

/** Makes `next` the present; what was undone can no longer be redone. */
export function commit(history: History, next: Draft): History {
  if (next === history.present) return history;
  return {
    past: [...history.past, history.present].slice(-MOST_UNDO),
    present: next,
    future: [],
  };
}

/** Steps back one change, when there is one. */
export function undo(history: History): History {
  const previous = history.past.at(-1);
  if (previous === undefined) return history;
  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future],
  };
}

/** Steps forward again over an undone change, when there is one. */
export function redo(history: History): History {
  const [next, ...rest] = history.future;
  if (next === undefined) return history;
  return { past: [...history.past, history.present], present: next, future: rest };
}

/** The draft with `placement` added, or put in place of the one with its id. */
export function withPlacement(draft: Draft, placement: WorldPlacement): Draft {
  const index = draft.placements.findIndex((one) => one.id === placement.id);
  const placements =
    index === -1
      ? [...draft.placements, placement]
      : draft.placements.map((one) => (one.id === placement.id ? placement : one));
  return { ...draft, placements };
}

/** The draft without the placement of `id`. */
export function withoutPlacement(draft: Draft, id: string): Draft {
  return { ...draft, placements: draft.placements.filter((one) => one.id !== id) };
}

/** The grid props snap to, in metres. */
export const GRID = 0.25;

/** A coordinate on the floor, snapped to the grid. */
export function snap(value: number): number {
  return Math.round(value / GRID) * GRID;
}

/** A placement turned a quarter to the right, its yaw kept within one turn. */
export function turned(placement: WorldPlacement): WorldPlacement {
  return { ...placement, yaw_deg: (((placement.yaw_deg + 90) % 360) + 360) % 360 };
}

/** A new placement of `kind` at a point on the floor, with its kind's defaults. */
export function newPlacement(kind: PropKind, x: number, z: number, id: string): WorldPlacement {
  return {
    id,
    kind,
    x: snap(x),
    z: snap(z),
    yaw_deg: 0,
    width: null,
    depth: null,
    zone: kind === 'zone_rug' ? 1 : null,
    variant: null,
    color: null,
  };
}
