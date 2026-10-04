import { ApiFormatSchema } from '@tbn/contracts';
import { CheckboxField } from '@/components/fields/CheckboxField';
import { SelectField } from '@/components/fields/SelectField';
import { TextField } from '@/components/fields/TextField';
import type { Form } from '@/lib/forms/useForm';
import { ModelsEditor } from './ModelsEditor';
import type { ProviderDraft } from './providerDraft';

const FORMAT_LABELS: Record<string, string> = {
  anthropic_messages: 'Anthropic Messages',
  openai_chat_completions: 'OpenAI Chat Completions',
};

/** Props of `ProviderFields`. */
export interface ProviderFieldsProps {
  form: Form<ProviderDraft>;
  /** True when editing: the key field may stay empty to keep the saved key. */
  hasSavedKey: boolean;
}

/** The fields of a provider: where it is, its key, its limits and its models. */
export function ProviderFields({ form, hasSavedKey }: ProviderFieldsProps) {
  const { draft, setField, errors } = form;
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <TextField
          label="Name"
          value={draft.name}
          onChange={(value) => setField('name', value)}
          error={errors['name']}
        />
        <SelectField
          label="API format"
          value={draft.api_format}
          options={ApiFormatSchema.options.map((value) => ({
            value,
            label: FORMAT_LABELS[value] ?? value,
          }))}
          onChange={(value) => {
            const format = ApiFormatSchema.safeParse(value);
            if (format.success) setField('api_format', format.data);
          }}
          error={errors['api_format']}
        />
        <TextField
          label="Base URL"
          type="url"
          placeholder="https://api.anthropic.com or http://host.docker.internal:11434/v1"
          hint="A local model such as Ollama, vLLM or LM Studio uses the OpenAI format and its /v1 address."
          value={draft.base_url}
          onChange={(value) => setField('base_url', value)}
          error={errors['base_url']}
        />
        <TextField
          label="API key"
          type="password"
          autoComplete="off"
          hint={
            hasSavedKey
              ? 'A key is saved. Leave this empty to keep it; it is never shown again.'
              : 'Encrypted on the server and never shown again. A local model may need none.'
          }
          value={draft.api_key}
          onChange={(value) => setField('api_key', value)}
          error={errors['api_key']}
        />
        <TextField
          label="Parallel requests"
          inputMode="numeric"
          hint="The most calls in flight at once on this key. Empty for no limit."
          value={draft.max_parallel_requests}
          onChange={(value) => setField('max_parallel_requests', value)}
          error={errors['max_parallel_requests']}
        />
        <CheckboxField
          label="Fallback for interns"
          hint="New interns fall back to this provider when a key passes its cap threshold."
          checked={draft.is_local}
          onChange={(value) => setField('is_local', value)}
        />
      </div>
      <ModelsEditor
        models={draft.models}
        onChange={(models) => setField('models', models)}
        errors={errors}
      />
    </div>
  );
}
