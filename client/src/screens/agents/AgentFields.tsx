import type { Provider } from '@tbn/contracts';
import { SelectField } from '@/components/fields/SelectField';
import { TextAreaField, TextField } from '@/components/fields/TextField';
import type { Form } from '@/lib/forms/useForm';
import { humanize } from '@/lib/format/labels';
import type { AgentDraft } from './agentDraft';
import { ToolPolicyEditor } from './ToolPolicyEditor';

/** Props of `AgentFields`. */
export interface AgentFieldsProps {
  form: Form<AgentDraft>;
  providers: readonly Provider[];
  disabled?: boolean;
}

/** The fields of an agent shared by the recruit form and the profile: who, how it thinks, its tools. */
export function AgentFields({ form, providers, disabled = false }: AgentFieldsProps) {
  const { draft, setField, errors } = form;
  const provider = providers.find((row) => row.id === draft.provider_id);
  const modelOptions = (provider?.models ?? []).map((model) => ({
    value: model.model_id,
    label: `${model.model_id} (${humanize(model.cost_tier).toLowerCase()})`,
  }));
  return (
    <fieldset disabled={disabled} className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <TextField
          label="Name"
          value={draft.name}
          onChange={(value) => setField('name', value)}
          error={errors['name']}
        />
        <TextField
          label="Role"
          hint="A manager heads a department named after its role."
          value={draft.role}
          onChange={(value) => setField('role', value)}
          error={errors['role']}
        />
        <TextAreaField
          className="md:col-span-2"
          label="Job description"
          rows={5}
          value={draft.job_description}
          onChange={(value) => setField('job_description', value)}
          error={errors['job_description']}
        />
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <SelectField
          label="Provider"
          placeholder="Choose a provider"
          value={draft.provider_id}
          options={providers.map((row) => ({ value: row.id, label: row.name }))}
          onChange={(value) => {
            setField('provider_id', value);
            setField('primary_model', '');
            setField('intern_model', '');
          }}
          error={errors['provider_id']}
        />
        <SelectField
          label="Model"
          placeholder={provider === undefined ? 'Choose a provider first' : 'Choose a model'}
          disabled={provider === undefined}
          value={draft.primary_model}
          options={modelOptions}
          onChange={(value) => setField('primary_model', value)}
          error={errors['primary_model']}
        />
        <SelectField
          label="Model for its interns"
          hint="A cheaper model keeps delegated work affordable."
          placeholder={provider === undefined ? 'Choose a provider first' : 'Choose a model'}
          disabled={provider === undefined}
          value={draft.intern_model}
          options={modelOptions}
          onChange={(value) => setField('intern_model', value)}
          error={errors['intern_model']}
        />
      </div>
      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-medium text-slate-800 dark:text-slate-200">
          Appearance
        </legend>
        <p className="text-xs text-slate-600 dark:text-slate-400">
          Parts of the character the world will draw from phase 4 on. All optional.
        </p>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <TextField
            label="Body"
            value={draft.body}
            onChange={(value) => setField('body', value)}
            error={errors['appearance.body']}
          />
          <TextField
            label="Hair"
            value={draft.hair}
            onChange={(value) => setField('hair', value)}
            error={errors['appearance.hair']}
          />
          <TextField
            label="Outfit"
            value={draft.outfit}
            onChange={(value) => setField('outfit', value)}
            error={errors['appearance.outfit']}
          />
          <TextField
            label="Accessory"
            value={draft.accessory}
            onChange={(value) => setField('accessory', value)}
            error={errors['appearance.accessory']}
          />
        </div>
      </fieldset>
      <ToolPolicyEditor
        rows={draft.tool_policy}
        onChange={(rows) => setField('tool_policy', rows)}
        errors={errors}
      />
    </fieldset>
  );
}
