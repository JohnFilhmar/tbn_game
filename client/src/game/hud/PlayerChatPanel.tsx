import { useQuery } from '@tanstack/react-query';
import { PlayerMessageSchema } from '@tbn/contracts';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Button } from '@/components/Button';
import { FormError } from '@/components/FormError';
import { StatusBadge } from '@/components/StatusBadge';
import { playSound } from '@/game/sound/soundEngine';
import { newCommandId } from '@/lib/api/apiClient';
import { queryKeys } from '@/lib/data/collections';
import { useCommand } from '@/lib/data/useCommand';
import { usePlayersStore } from '@/lib/stores/playersStore';
import { cx } from '@/lib/ui/cx';
import { useApi } from '@/providers/SessionProvider';

/** Props of `PlayerChatPanel`. */
export interface PlayerChatPanelProps {
  playerId: string;
  /** This client's own player id. */
  myId: string;
  onClose: () => void;
}

/**
 * A conversation with another player: the owner or a guest. Both players' panels show the same
 * thread; opening it marks what they sent you as read. It slides in beside the scene, and Escape
 * or Close leaves it, to come back to through the pending messages.
 */
export function PlayerChatPanel({ playerId, myId, onClose }: PlayerChatPanelProps) {
  const api = useApi();
  const partner = usePlayersStore((state) => state.players[playerId]);
  const messages = useQuery({
    queryKey: queryKeys.playerMessages(),
    queryFn: () => api.get('/player_messages', PlayerMessageSchema.array()),
  });
  const thread = (messages.data ?? []).filter(
    (message) =>
      (message.from_id === playerId && message.to_id === myId) ||
      (message.from_id === myId && message.to_id === playerId),
  );
  const name = partner?.name ?? thread.find((message) => message.from_id === playerId)?.from_name;
  const unread = thread.filter((message) => message.to_id === myId && message.read_at === null);
  const [text, setText] = useState('');
  const logRef = useRef<HTMLOListElement | null>(null);
  const send = useCommand(
    (client, body: { to_id: string; text: string }, commandId) =>
      client.send('POST', '/player_messages', PlayerMessageSchema, { body, commandId }),
    (client) => void client.invalidateQueries({ queryKey: queryKeys.playerMessages() }),
  );

  useEffect(() => {
    if (unread.length === 0) return;
    void api
      .sendNoContent('POST', '/player_messages/read', {
        body: { from_id: playerId },
        commandId: newCommandId(),
      })
      .catch(() => undefined);
  }, [api, playerId, unread.length]);

  useEffect(() => {
    const log = logRef.current;
    if (log !== null) log.scrollTop = log.scrollHeight;
  }, [thread.length]);

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    const trimmed = text.trim();
    if (trimmed.length === 0) return;
    const sent = await send.submit({ to_id: playerId, text: trimmed }).catch(() => null);
    if (sent === null) return;
    setText('');
    playSound('send');
  };

  const shownName = name ?? 'Someone';
  return (
    <aside
      aria-label={`Conversation with ${shownName}`}
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || event.defaultPrevented) return;
        event.preventDefault();
        onClose();
      }}
      className="dark pointer-events-auto fixed inset-x-2 bottom-2 z-30 flex h-1/2 flex-col gap-3 rounded-lg border-2 border-slate-700 bg-slate-900/95 p-4 text-slate-100 shadow-chunk backdrop-blur motion-safe:animate-slide-in md:inset-y-3 md:right-3 md:left-auto md:h-auto md:w-1/3 md:min-w-96"
    >
      <header className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="truncate font-display text-lg font-bold tracking-wide">{shownName}</h2>
          <p className="flex items-center gap-2 text-sm text-slate-300">
            {partner?.kind === 'owner' ? 'Owner' : 'Guest'}
            <StatusBadge
              status={partner?.online === true ? 'online' : 'offline'}
              tone={partner?.online === true ? 'success' : 'neutral'}
            />
          </p>
        </div>
        <Button size="sm" onClick={onClose} title="Close the conversation (Escape)">
          Close
        </Button>
      </header>
      <ol
        ref={logRef}
        aria-label={`Messages with ${shownName}`}
        className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto rounded-md bg-slate-950/60 p-3 text-sm"
      >
        {thread.length === 0 && <li className="text-slate-400">Say hello to {shownName}.</li>}
        {thread.map((message) => (
          <li
            key={message.id}
            className={cx(
              'max-w-[85%] rounded-md px-3 py-2',
              message.from_id === myId
                ? 'self-end bg-teal-800 text-white'
                : 'self-start bg-slate-800 text-slate-100',
            )}
          >
            <span className="block text-xs text-slate-300">
              {message.from_id === myId ? 'You' : message.from_name}
            </span>
            {message.text}
          </li>
        ))}
      </ol>
      <form className="flex gap-2" onSubmit={(event) => void submit(event)}>
        <label htmlFor="player-chat" className="sr-only">
          Message to {shownName}
        </label>
        <input
          id="player-chat"
          autoFocus
          value={text}
          maxLength={4_000}
          onChange={(event) => setText(event.target.value)}
          className="min-w-0 flex-1 rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm"
        />
        <Button type="submit" variant="primary" isBusy={send.isPending}>
          Send
        </Button>
      </form>
      <FormError message={send.error?.message ?? null} />
    </aside>
  );
}
