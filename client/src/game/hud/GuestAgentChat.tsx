import { useQuery } from '@tanstack/react-query';
import { GuestChatMessageSchema, type Agent } from '@tbn/contracts';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { playSound } from '@/game/sound/soundEngine';
import { Button } from '@/components/Button';
import { FormError } from '@/components/FormError';
import { Markdown } from '@/components/Markdown';
import { queryKeys } from '@/lib/data/collections';
import { useCommand } from '@/lib/data/useCommand';
import { cx } from '@/lib/ui/cx';
import { useApi } from '@/providers/SessionProvider';

/** Props of `GuestAgentChat`. */
export interface GuestAgentChatProps {
  agent: Agent;
  /** True while the agent works on a task: guests may only watch. */
  isBusy: boolean;
  /** The owner's name, who alone talks to a busy agent. */
  ownerName: string;
}

/**
 * A guest's conversation with an idle agent: their own lines and the agent's replies, written by
 * the guest model on the server, apart from the agent's own work. A busy agent only shows what it
 * does.
 */
export function GuestAgentChat({ agent, isBusy, ownerName }: GuestAgentChatProps) {
  const api = useApi();
  const lines = useQuery({
    queryKey: queryKeys.guestChat(agent.id),
    queryFn: () => api.get(`/agents/${agent.id}/guest_chat`, GuestChatMessageSchema.array()),
  });
  const [text, setText] = useState('');
  const logRef = useRef<HTMLOListElement | null>(null);
  const send = useCommand(
    (client, body: { text: string }, commandId) =>
      client.send('POST', `/agents/${agent.id}/guest_chat`, GuestChatMessageSchema, {
        body,
        commandId,
      }),
    (client) => void client.invalidateQueries({ queryKey: queryKeys.guestChat(agent.id) }),
  );
  const shown = lines.data ?? [];
  const isWaiting = shown.at(-1)?.role === 'guest';

  useEffect(() => {
    const log = logRef.current;
    if (log !== null) log.scrollTop = log.scrollHeight;
  }, [shown.length]);

  if (isBusy) {
    return (
      <p className="text-sm text-slate-300">
        {agent.name} is busy with a task. Only {ownerName} can talk with them now; watch what they
        do.
      </p>
    );
  }

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    const trimmed = text.trim();
    if (trimmed.length === 0) return;
    const sent = await send.submit({ text: trimmed }).catch(() => null);
    if (sent === null) return;
    setText('');
    playSound('send');
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <ol
        ref={logRef}
        aria-label={`Chat with ${agent.name}`}
        className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto rounded-md bg-slate-950/60 p-3 text-sm"
      >
        {shown.length === 0 && <li className="text-slate-400">Say hello to {agent.name}.</li>}
        {shown.map((line) => (
          <li
            key={line.id}
            className={cx(
              'max-w-[85%] rounded-md px-3 py-2',
              line.role === 'guest'
                ? 'self-end bg-teal-800 text-white'
                : line.is_error
                  ? 'self-start bg-slate-800 text-amber-200'
                  : 'self-start bg-slate-800 text-slate-100',
            )}
          >
            <span className="block text-xs text-slate-300">
              {line.role === 'guest' ? 'You' : agent.name}
            </span>
            {line.role === 'guest' || line.is_error ? (
              <p className="whitespace-pre-wrap">{line.text}</p>
            ) : (
              <Markdown text={line.text} />
            )}
          </li>
        ))}
        {isWaiting && (
          <li role="status" className="self-start text-slate-400">
            {agent.name} is thinking…
          </li>
        )}
      </ol>
      <form className="flex gap-2" onSubmit={(event) => void submit(event)}>
        <label htmlFor="guest-chat" className="sr-only">
          Message to {agent.name}
        </label>
        <input
          id="guest-chat"
          autoFocus
          value={text}
          maxLength={20_000}
          onChange={(event) => setText(event.target.value)}
          className="min-w-0 flex-1 rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm"
        />
        <Button type="submit" variant="primary" isBusy={send.isPending}>
          Send
        </Button>
      </form>
      <FormError message={send.error?.message ?? null} />
    </div>
  );
}
