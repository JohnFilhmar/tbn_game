import type { PropKind, SoundCueName } from '@tbn/contracts';
import type { ClipName } from '../assets/clipNames.ts';
import { spot, type SpotAnchor } from './spots.ts';

/** What a prop gives off while it is used: steam, bubbles, flying grass or water drops. */
export type EffectKind = 'steam' | 'bubbles' | 'blades' | 'drops';

/**
 * What using a prop does beyond the clip: open the board, pour, toggle the blinds, open the
 * lights, touch the grass, sit at the computer on a screen, read the cork board, open the time of
 * day, sit back, travel, water a plant, look at the trophies, or switch the radio.
 */
export type InteractionAction =
  | 'draw'
  | 'drink'
  | 'blinds'
  | 'lights'
  | 'grass'
  | 'desk'
  | 'cork'
  | 'clock'
  | 'sit'
  | 'travel'
  | 'water'
  | 'trophies'
  | 'radio';

/** How a kind of prop is used, by the owner and by idle agents. */
export interface Interaction {
  /** What E does, for the prompt and the narration: "pour a coffee". */
  verb: string;
  /** The verb once the prop is in its second state: blinds closed, a radio on. */
  verbWhenSet?: string;
  /** How close to the prop the owner must stand, in metres. */
  reach: number;
  /** What the owner plays, where they stand, and for how long. */
  clip: ClipName;
  seconds: number;
  effect: EffectKind | null;
  /** What using it sounds like, heard by everyone near; none for a look. */
  sound: SoundCueName | null;
  action: InteractionAction;
  /** The desk screen a `desk` action opens. */
  path?: string;
  /** Where idle agents use it, in the prop's frame; none for a prop they leave alone. A `sit`
   * action seats the owner on the first spot's seat. */
  spots: SpotAnchor[];
}

/** As long as the owner sits back: until they move. */
const UNTIL_MOVED = 3_600;

const LOOK = { clip: 'look', seconds: 1, effect: null, sound: null } as const;

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
    sound: 'scribble',
    action: 'draw',
    spots: [spot('board', [1.5, 0.55], [0.6, 0])],
  },
  coffee_set: {
    verb: 'pour a coffee',
    reach: 1.8,
    clip: 'drink',
    seconds: 3,
    effect: 'steam',
    sound: 'pour',
    action: 'drink',
    spots: [spot('coffee', [0, 0.85], [0, 0])],
  },
  water_cooler: {
    verb: 'pour a cup of water',
    reach: 1.8,
    clip: 'drink',
    seconds: 3,
    effect: 'bubbles',
    sound: 'bubble',
    action: 'drink',
    spots: [spot('water', [0, 0.75], [0, 0])],
  },
  blinds: {
    verb: 'close the blinds',
    verbWhenSet: 'open the blinds',
    reach: 2,
    clip: 'press',
    seconds: 1,
    effect: null,
    sound: 'blinds',
    action: 'blinds',
    spots: [spot('window', [0, 0.7], [0, 0])],
  },
  light_switch: {
    verb: 'use the light switch',
    reach: 2.2,
    clip: 'press',
    seconds: 1,
    effect: null,
    sound: 'click',
    action: 'lights',
    spots: [],
  },
  grass_patch: {
    verb: 'touch grass',
    reach: 1.8,
    clip: 'touch',
    seconds: 2.5,
    effect: 'blades',
    sound: 'rustle',
    action: 'grass',
    spots: [spot('grass', [0, 0.95], [0, 0])],
  },
  inbox_tray: {
    verb: 'check the inbox',
    reach: 1.6,
    ...LOOK,
    action: 'desk',
    path: '/approvals',
    spots: [],
  },
  cork_board: {
    verb: 'read the cork board',
    reach: 2.2,
    ...LOOK,
    action: 'cork',
    spots: [spot('look', [0, 0.9], [0, 0])],
  },
  server_rack: {
    verb: 'check the server rack',
    reach: 1.8,
    ...LOOK,
    action: 'desk',
    path: '/sandbox_jobs',
    spots: [spot('look', [0, 1.1], [0, 0])],
  },
  wall_clock: {
    verb: 'check the time',
    reach: 3,
    ...LOOK,
    action: 'clock',
    spots: [],
  },
  sofa: {
    verb: 'sit back',
    reach: 1.8,
    clip: 'sit',
    seconds: UNTIL_MOVED,
    effect: null,
    sound: 'sit',
    action: 'sit',
    spots: [spot('rest', [0, 0.95], [0, 2], [0, 0.05])],
  },
  beanbag: {
    verb: 'sit back',
    reach: 1.6,
    clip: 'sit',
    seconds: UNTIL_MOVED,
    effect: null,
    sound: 'sit',
    action: 'sit',
    spots: [spot('rest', [0, 0.75], [0, 2], [0, 0])],
  },
  exit_sign: {
    verb: 'leave for another place',
    reach: 3,
    ...LOOK,
    action: 'travel',
    spots: [],
  },
  plant: {
    verb: 'water the plant',
    reach: 1.6,
    clip: 'touch',
    seconds: 2,
    effect: 'drops',
    sound: 'sprinkle',
    action: 'water',
    spots: [spot('plant', [0, 0.9], [0, 0])],
  },
  tree: {
    verb: 'water the tree',
    reach: 1.8,
    clip: 'touch',
    seconds: 2,
    effect: 'drops',
    sound: 'sprinkle',
    action: 'water',
    spots: [spot('plant', [0, 1], [0, 0])],
  },
  trophy_shelf: {
    verb: 'look at the trophies',
    reach: 2.2,
    ...LOOK,
    action: 'trophies',
    spots: [spot('look', [0, 0.9], [0, 0])],
  },
  radio: {
    verb: 'turn the radio on',
    verbWhenSet: 'turn the radio off',
    reach: 1.8,
    clip: 'press',
    seconds: 1,
    effect: null,
    sound: 'click',
    action: 'radio',
    spots: [],
  },
};

/** The spots idle agents take at a kind of prop, from the table; none when it is not used. */
export function interactionSpots(kind: PropKind): SpotAnchor[] {
  return INTERACTIONS[kind]?.spots ?? [];
}

/** What E would do to a prop, given whether it is in its second state. */
export function verbOf(interaction: Interaction, isSet: boolean): string {
  return isSet ? (interaction.verbWhenSet ?? interaction.verb) : interaction.verb;
}

/** What each kind of spot gives off while an agent uses it there. */
export const SPOT_EFFECTS: Partial<Record<SpotAnchor['kind'], EffectKind>> = {
  coffee: 'steam',
  water: 'bubbles',
  grass: 'blades',
};
