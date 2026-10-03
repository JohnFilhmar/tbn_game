import type { LampMode, WhiteboardContent, WorldPropState } from '@tbn/contracts';

/** Every saved prop state of an environment, by placement id. */
export type PropStates = ReadonlyMap<string, WorldPropState>;

/** The saved states keyed by their placement. */
export function propStatesOf(states: readonly WorldPropState[] | undefined): PropStates {
  return new Map((states ?? []).map((state) => [state.placement_id, state]));
}

const EMPTY_BOARD: WhiteboardContent = { strokes: [], texts: [] };

/**
 * What a placed prop is in now: blinds open, a lamp's mode, a board's content. A prop with no
 * saved state is in its kind's first one: open, on auto, empty.
 */
export const stateOf = {
  isOpen: (states: PropStates, id: string): boolean => {
    const state = states.get(id);
    return state?.kind === 'blinds' ? state.state.open : true;
  },
  lampMode: (states: PropStates, id: string): LampMode => {
    const state = states.get(id);
    return state?.kind === 'lamp' ? state.state.mode : 'auto';
  },
  board: (states: PropStates, id: string): WhiteboardContent => {
    const state = states.get(id);
    return state?.kind === 'whiteboard' ? state.state : EMPTY_BOARD;
  },
};
