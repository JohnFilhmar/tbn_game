import type { ClipName } from '@/game/assets/clipNames';

/** How an agent takes a command: the gesture it makes and the short line it says. */
export interface Acknowledgement {
  gesture: ClipName;
  line: string;
}

/** The ways an agent takes a command: glad, polite, brisk, or with a sigh, but always taken. */
export const ACKNOWLEDGEMENTS: readonly Acknowledgement[] = [
  { gesture: 'thumbs_up', line: 'On it!' },
  { gesture: 'bow', line: 'Right away.' },
  { gesture: 'nod', line: 'Consider it done.' },
  { gesture: 'sigh', line: 'Fine, on it.' },
];

/** One of the acknowledgements, picked with `random`, a number in [0, 1). */
export function pickAcknowledgement(random: number): Acknowledgement {
  const index = Math.min(ACKNOWLEDGEMENTS.length - 1, Math.floor(random * ACKNOWLEDGEMENTS.length));
  return ACKNOWLEDGEMENTS[index] ?? { gesture: 'nod', line: 'On it.' };
}
