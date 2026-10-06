import type { PlayerPose } from '@tbn/contracts';

let sender: ((pose: PlayerPose) => void) | null = null;

/**
 * Sets where this client's pose goes: the live connection's socket, or nowhere while there is
 * none. The realtime provider calls it as it connects and closes.
 */
// ponytail: one module-level sender, as there is one connection per page.
export function setPresenceSender(next: ((pose: PlayerPose) => void) | null): void {
  sender = next;
}

/** Sends this player's pose to the others, when connected. */
export function sendPresence(pose: PlayerPose): void {
  sender?.(pose);
}
