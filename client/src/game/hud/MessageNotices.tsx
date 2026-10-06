import { useQuery } from '@tanstack/react-query';
import { PlayerMessageSchema } from '@tbn/contracts';
import { useEffect, useState } from 'react';
import { Button } from '@/components/Button';
import { chatWith } from '@/game/players/chatWith';
import { usePlayerUiStore } from '@/game/players/playerUiStore';
import { queryKeys } from '@/lib/data/collections';
import { subscribeToChanges } from '@/lib/realtime/changeFeed';
import { useApi } from '@/providers/SessionProvider';

/** How much of a message a pop up quotes. */
const QUOTE_CHARACTERS = 60;

/** Props of `MessageNotices`. */
export interface MessageNoticesProps {
  myId: string;
  /** True while seated at the desk: messages still arrive, and pop up once you stand. */
  isHidden: boolean;
}

/**
 * Messages from other players: a pop up for each that arrives outside its conversation, which
 * takes you beside the sender with the conversation open, and the list of conversations with
 * unread messages, to come back to any time.
 */
export function MessageNotices({ myId, isHidden }: MessageNoticesProps) {
  const api = useApi();
  const notices = usePlayerUiStore((state) => state.notices);
  const notify = usePlayerUiStore((state) => state.notify);
  const dismiss = usePlayerUiStore((state) => state.dismiss);
  const [isListOpen, setIsListOpen] = useState(false);
  const messages = useQuery({
    queryKey: queryKeys.playerMessages(),
    queryFn: () => api.get('/player_messages', PlayerMessageSchema.array()),
  });

  useEffect(
    () =>
      subscribeToChanges((events) => {
        const { chatWith: open } = usePlayerUiStore.getState();
        for (const event of events) {
          if (event.entity !== 'player_message' || event.op !== 'insert') continue;
          const message = event.data;
          if (message === null || message.to_id !== myId || message.from_id === open) continue;
          notify({ fromId: message.from_id, fromName: message.from_name, text: message.text });
        }
      }),
    [myId, notify],
  );

  const unreadBySender = new Map<string, { name: string; count: number }>();
  for (const message of messages.data ?? []) {
    if (message.to_id !== myId || message.read_at !== null) continue;
    const entry = unreadBySender.get(message.from_id) ?? { name: message.from_name, count: 0 };
    unreadBySender.set(message.from_id, { ...entry, count: entry.count + 1 });
  }
  const unreadCount = [...unreadBySender.values()].reduce((sum, entry) => sum + entry.count, 0);
  const open = (fromId: string, fromName: string): void => {
    dismiss(fromId);
    setIsListOpen(false);
    chatWith(fromId, fromName);
  };

  if (isHidden) return null;
  return (
    <div className="dark pointer-events-none fixed top-16 left-1/2 z-30 flex w-80 -translate-x-1/2 flex-col items-center gap-2">
      {notices.map((notice) => (
        <button
          key={notice.fromId}
          type="button"
          onClick={() => open(notice.fromId, notice.fromName)}
          className="pointer-events-auto w-full rounded-lg border-2 border-teal-600 bg-slate-900/95 px-3 py-2 text-left text-sm text-slate-100 shadow-chunk motion-safe:animate-slide-in"
        >
          <span className="block font-display font-semibold text-teal-300">
            {notice.fromName} sent you a message
          </span>
          <span className="block truncate text-slate-300">
            {notice.text.length > QUOTE_CHARACTERS
              ? `${notice.text.slice(0, QUOTE_CHARACTERS)}…`
              : notice.text}
          </span>
        </button>
      ))}
      {unreadCount > 0 && (
        <div className="pointer-events-auto flex flex-col items-center gap-1">
          <Button
            size="sm"
            aria-expanded={isListOpen}
            onClick={() => setIsListOpen((isOpen) => !isOpen)}
          >
            Messages · {unreadCount}
          </Button>
          {isListOpen && (
            <ul className="flex w-full flex-col gap-1 rounded-lg border-2 border-slate-700 bg-slate-900/95 p-2 text-sm">
              {[...unreadBySender.entries()].map(([fromId, entry]) => (
                <li key={fromId}>
                  <button
                    type="button"
                    onClick={() => open(fromId, entry.name)}
                    className="w-full rounded-md px-2 py-1 text-left hover:bg-slate-800"
                  >
                    {entry.name} · {entry.count} unread
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
