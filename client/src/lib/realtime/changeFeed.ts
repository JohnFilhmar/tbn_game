import type { ChangeEvent } from '@tbn/contracts';

type Listener = (events: readonly ChangeEvent[]) => void;

const listeners = new Set<Listener>();

/** Hands a batch of changes to everything that watches the feed, after the cache has them. */
export function publishChanges(events: readonly ChangeEvent[]): void {
  for (const listener of listeners) listener(events);
}

/** Watches the changes the live connection applies; returns the way to stop. */
export function subscribeToChanges(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
