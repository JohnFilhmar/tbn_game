import { IntegrationBodyFormatSchema, IntegrationMethodSchema } from '@tbn/contracts';
import { SelectField, optionsOf } from '@/components/fields/SelectField';
import { TextAreaField, TextField } from '@/components/fields/TextField';
import type { Form } from '@/lib/forms/useForm';
import { HeadersEditor } from './HeadersEditor';
import type { IntegrationDraft } from './integrationDraft';
import { PlaceholdersEditor } from './PlaceholdersEditor';

/** Props of `IntegrationFields`. */
export interface IntegrationFieldsProps {
  form: Form<IntegrationDraft>;
  hasSavedToken: boolean;
}

/** The fields of an integration: the request template, its token and its placeholders. */
export function IntegrationFields({ form, hasSavedToken }: IntegrationFieldsProps) {
  const { draft, setField, errors } = form;
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <TextField
          label="Name"
          className="md:col-span-2"
          hint="Agents call it as call_<name>."
          value={draft.name}
          onChange={(value) => setField('name', value)}
          error={errors['name']}
        />
        <SelectField
          label="Method"
          value={draft.method}
          options={optionsOf(IntegrationMethodSchema.options, (method) => method)}
          onChange={(value) => {
            const method = IntegrationMethodSchema.safeParse(value);
            if (method.success) setField('method', method.data);
          }}
        />
        <SelectField
          label="Body format"
          value={draft.body_format}
          options={optionsOf(IntegrationBodyFormatSchema.options, (format) =>
            format === 'none' ? 'No body' : format.toUpperCase(),
          )}
          onChange={(value) => {
            const format = IntegrationBodyFormatSchema.safeParse(value);
            if (format.success) setField('body_format', format.data);
          }}
        />
        <TextField
          label="URL"
          className="md:col-span-4"
          placeholder="https://hooks.example.com/{{channel}}"
          value={draft.url}
          onChange={(value) => setField('url', value)}
          error={errors['url']}
        />
        <TextField
          label="Token"
          type="password"
          autoComplete="off"
          className="md:col-span-4"
          hint={
            hasSavedToken
              ? 'A token is saved. Leave this empty to keep it. It goes where {{token}} appears and is never shown again.'
              : 'Optional. It goes where {{token}} appears, is encrypted, and is never shown again.'
          }
          value={draft.token}
          onChange={(value) => setField('token', value)}
          error={errors['token']}
        />
      </div>
      <HeadersEditor
        rows={draft.headers}
        onChange={(rows) => setField('headers', rows)}
        error={errors['headers']}
      />
      {draft.body_format !== 'none' && (
        <TextAreaField
          label="Body template"
          rows={6}
          isCode
          value={draft.body_template}
          onChange={(value) => setField('body_template', value)}
          error={errors['body_template']}
        />
      )}
      <PlaceholdersEditor
        rows={draft.placeholders}
        onChange={(rows) => setField('placeholders', rows)}
        errors={errors}
      />
    </div>
  );
}
