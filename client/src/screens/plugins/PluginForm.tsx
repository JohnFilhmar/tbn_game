import { CreatePluginSchema, PluginSchema, UpdatePluginSchema, type Plugin } from '@tbn/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/Button';
import { CheckboxField } from '@/components/fields/CheckboxField';
import { TextField } from '@/components/fields/TextField';
import { FormError } from '@/components/FormError';
import { putRow } from '@/lib/data/cacheWrites';
import { COLLECTIONS } from '@/lib/data/collections';
import { useForm } from '@/lib/forms/useForm';
import { useApi } from '@/providers/SessionProvider';

/** Props of `PluginForm`. */
export interface PluginFormProps {
  plugin: Plugin | undefined;
  onDone: () => void;
}

/** Adds or edits a plugin: an MCP server over streamable HTTP and its optional token. */
export function PluginForm({ plugin, onDone }: PluginFormProps) {
  const api = useApi();
  const client = useQueryClient();
  const form = useForm({
    initial: {
      name: plugin?.name ?? '',
      url: plugin?.url ?? '',
      token: '',
      enabled: plugin?.enabled ?? true,
    },
    schema: plugin === undefined ? CreatePluginSchema : UpdatePluginSchema,
    toInput: (draft) => ({
      name: draft.name.trim(),
      url: draft.url.trim(),
      enabled: draft.enabled,
      ...(draft.token.length > 0 ? { token: draft.token } : {}),
    }),
    onSubmit: async (body, commandId) => {
      const saved =
        plugin === undefined
          ? await api.send('POST', '/plugins', PluginSchema, { body, commandId })
          : await api.send('PATCH', `/plugins/${plugin.id}`, PluginSchema, {
              body,
              commandId,
            });
      putRow(client, COLLECTIONS.plugins, saved);
      onDone();
    },
  });
  const { draft, setField, errors } = form;
  return (
    <form className="flex flex-col gap-4" noValidate onSubmit={form.handleSubmit}>
      <TextField
        label="Name"
        hint="Its tools appear to agents as plugin_<name>__<tool>."
        value={draft.name}
        onChange={(value) => setField('name', value)}
        error={errors['name']}
      />
      <TextField
        label="URL"
        type="url"
        value={draft.url}
        onChange={(value) => setField('url', value)}
        error={errors['url']}
      />
      <TextField
        label="Token"
        type="password"
        autoComplete="off"
        hint={
          plugin?.token_set === true
            ? 'A token is saved. Leave this empty to keep it.'
            : 'Optional. Sent as a bearer token; it stays in the worker.'
        }
        value={draft.token}
        onChange={(value) => setField('token', value)}
        error={errors['token']}
      />
      <CheckboxField
        label="Enabled"
        checked={draft.enabled}
        onChange={(value) => setField('enabled', value)}
      />
      <FormError message={errors['']} />
      <div className="flex justify-end gap-2">
        <Button onClick={onDone}>Cancel</Button>
        <Button type="submit" variant="primary" isBusy={form.isSubmitting}>
          {plugin === undefined ? 'Add' : 'Save'}
        </Button>
      </div>
    </form>
  );
}
