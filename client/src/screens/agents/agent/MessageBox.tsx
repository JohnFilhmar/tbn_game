import { OwnerMessageSchema, TranscriptEntrySchema } from '@tbn/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/Button';
import { TextAreaField } from '@/components/fields/TextField';
import { FormError } from '@/components/FormError';
import { newCommandId } from '@/lib/api/apiClient';
import { putTranscriptEntry } from '@/lib/data/cacheWrites';
import { useForm } from '@/lib/forms/useForm';
import { useApi } from '@/providers/SessionProvider';

/** Props of `MessageBox`. */
export interface MessageBoxProps {
  agentId: string;
  agentName: string;
  /** Why the agent cannot take messages, if it cannot. */
  closedReason: string | null;
}

/** Where the owner writes to an agent. Ctrl or Cmd with Enter sends. */
export function MessageBox({ agentId, agentName, closedReason }: MessageBoxProps) {
  const api = useApi();
  const client = useQueryClient();
  const form = useForm({
    initial: { text: '' },
    schema: OwnerMessageSchema,
    toInput: (draft) => ({ text: draft.text.trim() }),
    onSubmit: async (body) => {
      const entry = await api.send('POST', `/agents/${agentId}/messages`, TranscriptEntrySchema, {
        body,
        commandId: newCommandId(),
      });
      putTranscriptEntry(client, entry);
      form.reset({ text: '' });
    },
  });
  return (
    <form className="flex flex-col gap-2" noValidate onSubmit={form.handleSubmit}>
      <TextAreaField
        label={`Message to ${agentName}`}
        hint={closedReason ?? 'Ctrl or Cmd with Enter sends.'}
        rows={3}
        disabled={closedReason !== null}
        value={form.draft.text}
        onChange={(value) => form.setField('text', value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
            form.handleSubmit(event);
          }
        }}
        error={form.errors['text']}
      />
      <FormError message={form.errors['']} />
      <div className="flex justify-end">
        <Button
          type="submit"
          variant="primary"
          isBusy={form.isSubmitting}
          disabled={closedReason !== null}
        >
          Send
        </Button>
      </div>
    </form>
  );
}
