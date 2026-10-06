import type { PlayerPose, SoundCue } from '@tbn/contracts';

/** Where this client's pose and sounds go. */
export interface PresenceSender {
  sendPresence: (pose: PlayerPose) => void;
  sendCue: (cue: SoundCue) => void;
}

let sender: PresenceSender | null = null;

/**
 * Sets where this client's pose and sounds go: the live connection's socket, or nowhere while
 * there is none. The realtime provider calls it as it connects and closes.
 */
// ponytail: one module-level sender, as there is one connection per page.
export function setPresenceSender(next: PresenceSender | null): void {
  sender = next;
}

/** Sends this player's pose to the others, when connected. */
export function sendPresence(pose: PlayerPose): void {
  sender?.sendPresence(pose);
}

/** Sends a sound this player made to the others, when connected. */
export function sendCue(cue: SoundCue): void {
  sender?.sendCue(cue);
}
