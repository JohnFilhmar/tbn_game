import {
  CreateSearchProviderSchema,
  SearchProviderSchema,
  SearchProviderTypeSchema,
  UpdateSearchProviderSchema,
  type SearchProvider,
  type SearchProviderType,
} from '@tbn/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/Button';
import { CheckboxField } from '@/components/fields/CheckboxField';
import { SelectField } from '@/components/fields/SelectField';
import { TextField } from '@/components/fields/TextField';
import { FormError } from '@/components/FormError';
import { putRow } from '@/lib/data/cacheWrites';
import { COLLECTIONS } from '@/lib/data/collections';
import { numberOrNull, numberText } from '@/lib/forms/numbers';
import { useForm } from '@/lib/forms/useForm';
import { useApi } from '@/providers/SessionProvider';

interface SearchDraft {
  type: SearchProviderType;
  name: string;
  base_url: string;
  api_key: string;
  priority: string;
  enabled: boolean;
  price_per_thousand_requests: string;
}

function draftOf(provider: SearchProvider | undefined): SearchDraft {
  if (provider === undefined) {
    return {
      type: 'brave',
      name: '',
      base_url: 'https://api.search.brave.com',
      api_key: '',
      priority: '0',
      enabled: true,
      price_per_thousand_requests: '',
    };
  }
  return {
    type: provider.type,
    name: provider.name,
    base_url: provider.base_url,
    api_key: '',
    priority: String(provider.priority),
    enabled: provider.enabled,
    price_per_thousand_requests: numberText(provider.price_per_thousand_requests),
  };
}

/** Props of `SearchProviderForm`. */
export interface SearchProviderFormProps {
  provider: SearchProvider | undefined;
  onDone: () => void;
}

/** Adds or edits a search provider: Brave with a key, or a SearXNG instance. */
export function SearchProviderForm({ provider, onDone }: SearchProviderFormProps) {
  const api = useApi();
  const client = useQueryClient();
  const form = useForm({
    initial: draftOf(provider),
    schema: provider === undefined ? CreateSearchProviderSchema : UpdateSearchProviderSchema,
    toInput: (draft) => ({
      type: draft.type,
      name: draft.name.trim(),
      base_url: draft.base_url.trim(),
      ...(draft.api_key.length > 0 ? { api_key: draft.api_key } : {}),
      priority: numberOrNull(draft.priority) ?? 0,
      enabled: draft.enabled,
      price_per_thousand_requests: numberOrNull(draft.price_per_thousand_requests),
    }),
    onSubmit: async (body, commandId) => {
      const saved =
        provider === undefined
          ? await api.send('POST', '/search_providers', SearchProviderSchema, {
              body,
              commandId,
            })
          : await api.send('PATCH', `/search_providers/${provider.id}`, SearchProviderSchema, {
              body,
              commandId,
            });
      putRow(client, COLLECTIONS.searchProviders, saved);
      onDone();
    },
  });
  const { draft, setField, errors } = form;
  return (
    <form className="flex flex-col gap-4" noValidate onSubmit={form.handleSubmit}>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <SelectField
          label="Type"
          value={draft.type}
          options={[
            { value: 'brave', label: 'Brave Search API' },
            { value: 'searxng', label: 'SearXNG' },
          ]}
          onChange={(value) => {
            const type = SearchProviderTypeSchema.safeParse(value);
            if (type.success) setField('type', type.data);
          }}
        />
        <TextField
          label="Name"
          value={draft.name}
          onChange={(value) => setField('name', value)}
          error={errors['name']}
        />
        <TextField
          label="Base URL"
          type="url"
          value={draft.base_url}
          onChange={(value) => setField('base_url', value)}
          error={errors['base_url']}
        />
        <TextField
          label="API key"
          type="password"
          autoComplete="off"
          hint={
            provider?.api_key_set === true
              ? 'A key is saved. Leave this empty to keep it.'
              : 'Brave needs one; SearXNG does not.'
          }
          value={draft.api_key}
          onChange={(value) => setField('api_key', value)}
          error={errors['api_key']}
        />
        <TextField
          label="Priority"
          inputMode="numeric"
          hint="Lower is tried first; the next one is tried when it fails."
          value={draft.priority}
          onChange={(value) => setField('priority', value)}
          error={errors['priority']}
        />
        <TextField
          label="Price per thousand requests"
          inputMode="decimal"
          hint="Optional. Feeds the money the search cache saved."
          value={draft.price_per_thousand_requests}
          onChange={(value) => setField('price_per_thousand_requests', value)}
          error={errors['price_per_thousand_requests']}
        />
      </div>
      <CheckboxField
        label="Enabled"
        checked={draft.enabled}
        onChange={(value) => setField('enabled', value)}
      />
      <FormError message={errors['']} />
      <div className="flex justify-end gap-2">
        <Button onClick={onDone}>Cancel</Button>
        <Button type="submit" variant="primary" isBusy={form.isSubmitting}>
          {provider === undefined ? 'Add' : 'Save'}
        </Button>
      </div>
    </form>
  );
}
