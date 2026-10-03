import type { PropKind } from '@tbn/contracts';
import type { ClipName } from '../assets/clipNames.ts';
import { spot, type SpotAnchor } from './spots.ts';

/** What a prop gives off while it is used: steam from a coffee, bubbles from water, flying grass. */
export type EffectKind = 'steam' | 'bubbles' | 'blades';

/** What using a prop does beyond the clip: open the board, pour, toggle, open the lights, touch. */
export type InteractionAction = 'draw' | 'drink' | 'blinds' | 'lights' | 'grass';

/** How a kind of prop is used, by the owner and by idle agents. */
export interface Interaction {
  /** What E does, for the prompt and the narration: "pour a coffee". */
  verb: string;
  /** The verb once the prop is closed, for blinds. */
  verbWhenClosed?: string;
  /** How close to the prop the owner must stand, in metres. */
  reach: number;
  /** What the owner plays, where they stand, and for how long. */
  clip: ClipName;
  seconds: number;
  effect: EffectKind | null;
  action: InteractionAction;
  /** Where idle agents use it, in the prop's frame; none for a prop they leave alone. */
  spots: SpotAnchor[];
}

/**
 * Every prop kind someone can use. The HUD's prompt and the agents' wander spots both read this
 * one table, so a prop the owner places is usable by both at once.
 */
export const INTERACTIONS: Partial<Record<PropKind, Interaction>> = {
  whiteboard: {
    verb: 'draw on the whiteboard',
    reach: 2.2,
    clip: 'write',
    seconds: 1,
    effect: null,
    action: 'draw',
    spots: [spot('board', [1.5, 0.55], [0.6, 0])],
  },
  coffee_set: {
    verb: 'pour a coffee',
    reach: 1.8,
    clip: 'drink',
    seconds: 3,
    effect: 'steam',
    action: 'drink',
    spots: [spot('coffee', [0, 0.85], [0, 0])],
  },
  water_cooler: {
    verb: 'pour a cup of water',
    reach: 1.8,
    clip: 'drink',
    seconds: 3,
    effect: 'bubbles',
    action: 'drink',
    spots: [spot('water', [0, 0.75], [0, 0])],
  },
  blinds: {
    verb: 'close the blinds',
    verbWhenClosed: 'open the blinds',
    reach: 2,
    clip: 'press',
    seconds: 1,
    effect: null,
    action: 'blinds',
    spots: [spot('window', [0, 0.7], [0, 0])],
  },
  light_switch: {
    verb: 'use the light switch',
    reach: 2.2,
    clip: 'press',
    seconds: 1,
    effect: null,
    action: 'lights',
    spots: [],
  },
  grass_patch: {
    verb: 'touch grass',
    reach: 1.8,
    clip: 'touch',
    seconds: 2.5,
    effect: 'blades',
    action: 'grass',
    spots: [spot('grass', [0, 0.95], [0, 0])],
  },
};

/** The spots idle agents take at a kind of prop, from the table; none when it is not used. */
export function interactionSpots(kind: PropKind): SpotAnchor[] {
  return INTERACTIONS[kind]?.spots ?? [];
}

/** What E would do to a prop, given whether it is closed (blinds only). */
export function verbOf(interaction: Interaction, isClosed: boolean): string {
  return isClosed ? (interaction.verbWhenClosed ?? interaction.verb) : interaction.verb;
}

/** What each kind of spot gives off while an agent uses it there. */
export const SPOT_EFFECTS: Partial<Record<SpotAnchor['kind'], EffectKind>> = {
  coffee: 'steam',
  water: 'bubbles',
  grass: 'blades',
};
