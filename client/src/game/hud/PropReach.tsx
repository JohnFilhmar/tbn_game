import type { WorldPlacement } from '@tbn/contracts';
import type { PropStates } from '@/game/objects/propStates';
import { propVerb } from './useInteract';

/** Props of `PropReach`. */
export interface PropReachProps {
  /** The props within reach, nearest first. */
  propIds: readonly string[];
  placements: readonly WorldPlacement[];
  states: PropStates;
  onUse: (placementId: string) => void;
}

function capitalised(text: string): string {
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}

/**
 * The props within the owner's reach as buttons, whichever way the owner faces, so every
 * interaction works without the canvas.
 */
export function PropReach({ propIds, placements, states, onUse }: PropReachProps) {
  const usable = propIds.flatMap((id) => {
    const placement = placements.find((one) => one.id === id);
    const verb = placement === undefined ? null : propVerb(placement, states);
    return verb === null ? [] : [{ id, verb }];
  });
  if (usable.length === 0) return null;
  return (
    <ul aria-label="Within reach" className="flex flex-wrap gap-1">
      {usable.map(({ id, verb }) => (
        <li key={id}>
          <button
            type="button"
            onClick={() => onUse(id)}
            className="rounded-md border border-slate-600 bg-slate-800 px-1.5 py-0.5 font-display text-xs font-semibold text-slate-100 shadow-chunk hover:bg-slate-700 active:translate-y-px active:shadow-none"
          >
            {capitalised(verb)}
          </button>
        </li>
      ))}
    </ul>
  );
}
