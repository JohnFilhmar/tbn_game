import type { ChangeEvent, EventEntity } from '@tbn/contracts';

/** Who a socket belongs to: the owner, or one of the owner's guests. */
export interface Viewer {
  id: string;
  kind: 'owner' | 'guest';
}

/**
 * Entities a guest never receives: connection settings that work like secrets, and the provider
 * spend that every model call moves. The routes behind them are `@OwnerOnly()` too.
 */
const OWNER_ONLY: ReadonlySet<EventEntity> = new Set<EventEntity>([
  'provider',
  'cap_windows',
  'search_provider',
  'integration',
  'plugin',
  'notification_channel',
]);

/**
 * Whether a change reaches a socket. A player message reaches only its two players, a guest's chat
 * with an agent only that guest and the owner, and owner-only settings never reach a guest.
 */
export function is_visible(event: ChangeEvent, viewer: Viewer): boolean {
  if (event.entity === 'player_message') {
    return (
      event.data !== null && (event.data.from_id === viewer.id || event.data.to_id === viewer.id)
    );
  }
  if (viewer.kind === 'owner') return true;
  if (event.entity === 'guest_chat_message') return event.data?.guest_id === viewer.id;
  return !OWNER_ONLY.has(event.entity);
}
