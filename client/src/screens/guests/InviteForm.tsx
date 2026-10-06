import { CreatedGuestInviteSchema } from '@tbn/contracts';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/Button';
import { FormError } from '@/components/FormError';
import { TextField } from '@/components/fields/TextField';
import { Panel } from '@/components/Panel';
import { queryKeys } from '@/lib/data/collections';
import { useCommand } from '@/lib/data/useCommand';

/** Props of `InviteForm`. */
export interface InviteFormProps {
  /** A guest to sign back in with the new link, with their name; null for a new friend. */
  returning: { guest_id: string; name: string } | null;
}

/**
 * Creates an invite link and shows it once, to copy and send. The link works once, for a day; a
 * link for a returning guest signs them back in as themselves.
 */
export function InviteForm({ returning }: InviteFormProps) {
  const [label, setLabel] = useState('');
  const [link, setLink] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState(false);
  const create = useCommand(
    (api, input: { label: string; guest_id?: string }, commandId) =>
      api.send('POST', '/guests/invites', CreatedGuestInviteSchema, { body: input, commandId }),
    (client) => {
      void client.invalidateQueries({ queryKey: queryKeys.guestInvites() });
    },
  );

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    const name = returning?.name ?? label.trim();
    if (name.length === 0) return;
    const created = await create
      .submit({ label: name, ...(returning !== null && { guest_id: returning.guest_id }) })
      .catch(() => null);
    if (created === null) return;
    setLink(`${window.location.origin}${created.path}`);
    setIsCopied(false);
    setLabel('');
  };

  const copy = async (): Promise<void> => {
    if (link === null) return;
    await navigator.clipboard.writeText(link).catch(() => undefined);
    setIsCopied(true);
  };

  return (
    <Panel
      title={returning === null ? 'Invite a friend' : `A new link for ${returning.name}`}
      description="The link works once, for 24 hours, and signs them in as a guest for 30 days. It is shown only here, so copy it now."
    >
      <form className="flex flex-wrap items-end gap-3" onSubmit={(event) => void submit(event)}>
        {returning === null && (
          <TextField
            label="Who is it for"
            value={label}
            onChange={setLabel}
            hint="Your note; they pick their own name."
          />
        )}
        <Button type="submit" variant="primary" isBusy={create.isPending}>
          Create link
        </Button>
      </form>
      <FormError message={create.error?.message ?? null} />
      {link !== null && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            readOnly
            aria-label="Invite link"
            value={link}
            onFocus={(event) => event.currentTarget.select()}
            className="min-w-0 flex-1 rounded-md border border-slate-300 bg-slate-50 px-3 py-2 font-mono text-sm dark:border-slate-600 dark:bg-slate-800"
          />
          <Button onClick={() => void copy()}>{isCopied ? 'Copied' : 'Copy'}</Button>
        </div>
      )}
    </Panel>
  );
}
