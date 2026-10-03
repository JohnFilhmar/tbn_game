import type { LampMode, WhiteboardContent, WorldPropState } from '@tbn/contracts';

/** Every saved prop state of an environment, by placement id. */
export type PropStates = ReadonlyMap<string, WorldPropState>;

/** The saved states keyed by their placement. */
export function propStatesOf(states: readonly WorldPropState[] | undefined): PropStates {
  return new Map((states ?? []).map((state) => [state.placement_id, state]));
}

const EMPTY_BOARD: WhiteboardContent = { strokes: [], texts: [] };

/** How long a plant stays up after a watering. */
export const THIRSTY_AFTER_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * What a placed prop is in now: blinds open, a lamp's mode, a board's content, when a plant was
 * watered, a radio's switch. A prop with no saved state is in its kind's first one: open, on
 * auto, empty, never watered, off.
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
  wateredAt: (states: PropStates, id: string): string | null => {
    const state = states.get(id);
    return state?.kind === 'plant' || state?.kind === 'tree' ? state.state.watered_at : null;
  },
  isRadioOn: (states: PropStates, id: string): boolean => {
    const state = states.get(id);
    return state?.kind === 'radio' ? state.state.on : false;
  },
};

/** True when a plant droops: never watered, or watered more than three days before `now`. */
export function isThirsty(wateredAt: string | null, now: number): boolean {
  return wateredAt === null || now - Date.parse(wateredAt) > THIRSTY_AFTER_MS;
}
