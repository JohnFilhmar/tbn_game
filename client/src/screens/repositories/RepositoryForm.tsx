import { CreateRepositorySchema, RepositorySchema } from '@tbn/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/Button';
import { TextField } from '@/components/fields/TextField';
import { FormError } from '@/components/FormError';
import { newCommandId } from '@/lib/api/apiClient';
import { putRow } from '@/lib/data/cacheWrites';
import { COLLECTIONS } from '@/lib/data/collections';
import { optionalText } from '@/lib/forms/text';
import { useForm } from '@/lib/forms/useForm';
import { useApi } from '@/providers/SessionProvider';

/** Registers a repository: an empty one, or a clone of a public remote. */
export function RepositoryForm({ onDone }: { onDone: () => void }) {
  const api = useApi();
  const client = useQueryClient();
  const form = useForm({
    initial: { name: '', remote_url: '', default_branch: '' },
    schema: CreateRepositorySchema,
    toInput: (draft) => ({
      name: draft.name.trim(),
      remote_url: optionalText(draft.remote_url),
      default_branch: optionalText(draft.default_branch),
    }),
    onSubmit: async (body) => {
      const repository = await api.send('POST', '/repositories', RepositorySchema, {
        body,
        commandId: newCommandId(),
      });
      putRow(client, COLLECTIONS.repositories, repository);
      onDone();
    },
  });
  const { draft, setField, errors } = form;
  return (
    <form className="flex flex-col gap-4" noValidate onSubmit={form.handleSubmit}>
      <TextField
        label="Name"
        hint="Lowercase letters, digits, underscores and dashes."
        value={draft.name}
        onChange={(value) => setField('name', value)}
        error={errors['name']}
      />
      <TextField
        label="Remote URL"
        type="url"
        hint="Optional. A public repository the server clones and only ever fetches from."
        value={draft.remote_url}
        onChange={(value) => setField('remote_url', value)}
        error={errors['remote_url']}
      />
      <TextField
        label="Default branch"
        placeholder="main"
        value={draft.default_branch}
        onChange={(value) => setField('default_branch', value)}
        error={errors['default_branch']}
      />
      <FormError message={errors['']} />
      <div className="flex justify-end gap-2">
        <Button onClick={onDone}>Cancel</Button>
        <Button type="submit" variant="primary" isBusy={form.isSubmitting}>
          Register
        </Button>
      </div>
    </form>
  );
}
