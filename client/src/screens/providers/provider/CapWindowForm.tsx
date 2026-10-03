import {
  CapLengthUnitSchema,
  CapResetModeSchema,
  CapUnitSchema,
  CapWindowStatusSchema,
  CreateCapWindowSchema,
  UpdateCapWindowSchema,
  type CapWindowStatus,
  type Provider,
} from '@tbn/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/Button';
import { CheckboxField } from '@/components/fields/CheckboxField';
import { SelectField, optionsOf } from '@/components/fields/SelectField';
import { TextField } from '@/components/fields/TextField';
import { FormError } from '@/components/FormError';
import { queryKeys } from '@/lib/data/collections';
import { upsertRow } from '@/lib/realtime/applyChanges';
import { humanize } from '@/lib/format/labels';
import { useForm } from '@/lib/forms/useForm';
import { useApi } from '@/providers/SessionProvider';
import { capDraftOf, capInput, EMPTY_CAP_DRAFT, type CapDraft } from './capDraft';

/** Props of `CapWindowForm`. */
export interface CapWindowFormProps {
  provider: Provider;
  /** The window to edit, or undefined for a new one. */
  window: CapWindowStatus | undefined;
  onDone: () => void;
}

function pick<Value extends string>(
  schema: { safeParse: (value: unknown) => { success: true; data: Value } | { success: false } },
  value: string,
  apply: (parsed: Value) => void,
): void {
  const parsed = schema.safeParse(value);
  if (parsed.success) apply(parsed.data);
}

/** Adds or edits one usage cap on a provider key. */
export function CapWindowForm({ provider, window, onDone }: CapWindowFormProps) {
  const api = useApi();
  const client = useQueryClient();
  const form = useForm({
    initial: window === undefined ? EMPTY_CAP_DRAFT : capDraftOf(window),
    schema: window === undefined ? CreateCapWindowSchema : UpdateCapWindowSchema,
    toInput: capInput,
    onSubmit: async (body, commandId) => {
      const base = `/providers/${provider.id}/cap_windows`;
      const saved =
        window === undefined
          ? await api.send('POST', base, CapWindowStatusSchema, { body, commandId })
          : await api.send('PATCH', `${base}/${window.id}`, CapWindowStatusSchema, {
              body,
              commandId,
            });
      client.setQueryData<CapWindowStatus[]>(queryKeys.capWindows(provider.id), (rows) =>
        rows === undefined ? rows : upsertRow(rows, saved),
      );
      onDone();
    },
  });
  const { draft, setField, errors } = form;
  const set =
    <Key extends keyof CapDraft>(key: Key) =>
    (value: CapDraft[Key]) =>
      setField(key, value);
  return (
    <form className="flex flex-col gap-4" noValidate onSubmit={form.handleSubmit}>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <TextField
          label="Name"
          placeholder="Five hours"
          value={draft.name}
          onChange={set('name')}
          error={errors['name']}
        />
        <SelectField
          label="Model"
          placeholder="Every model on the key"
          value={draft.model_id}
          options={provider.models.map((model) => ({
            value: model.model_id,
            label: model.model_id,
          }))}
          onChange={set('model_id')}
          error={errors['model_id']}
        />
        <TextField
          label="Length"
          inputMode="numeric"
          value={draft.length_count}
          onChange={set('length_count')}
          error={errors['length_count']}
        />
        <SelectField
          label="Length unit"
          value={draft.length_unit}
          options={optionsOf(CapLengthUnitSchema.options, (unit) => humanize(`${unit}s`))}
          onChange={(value) => pick(CapLengthUnitSchema, value, set('length_unit'))}
        />
        <SelectField
          label="Resets"
          value={draft.reset_mode}
          options={optionsOf(CapResetModeSchema.options, (mode) =>
            mode === 'rolling'
              ? 'Rolling: the last length up to now'
              : 'Fixed: from an anchor time',
          )}
          onChange={(value) => pick(CapResetModeSchema, value, set('reset_mode'))}
        />
        {draft.reset_mode === 'fixed' && (
          <TextField
            label="Anchor time"
            type="datetime-local"
            hint="In this device's time. The window steps from here."
            value={draft.anchor_at}
            onChange={set('anchor_at')}
            error={errors['anchor_at']}
          />
        )}
        <SelectField
          label="Counts"
          value={draft.unit}
          options={optionsOf(CapUnitSchema.options, (unit) =>
            unit === 'money' ? 'Money at your prices' : humanize(unit),
          )}
          onChange={(value) => pick(CapUnitSchema, value, set('unit'))}
        />
        <TextField
          label="Limit"
          inputMode="decimal"
          value={draft.limit}
          onChange={set('limit')}
          error={errors['limit']}
        />
        <TextField
          label="Threshold percent"
          inputMode="numeric"
          hint="Past it, new interns use the local model. Empty uses your default."
          value={draft.threshold_percent}
          onChange={set('threshold_percent')}
          error={errors['threshold_percent']}
        />
      </div>
      <CheckboxField
        label="Enforce this cap"
        hint="At the limit, runs on this key pause until the window resets. Off only shows usage."
        checked={draft.enforced}
        onChange={set('enforced')}
      />
      <FormError message={errors['']} />
      <div className="flex justify-end gap-2">
        <Button onClick={onDone}>Cancel</Button>
        <Button type="submit" variant="primary" isBusy={form.isSubmitting}>
          {window === undefined ? 'Add cap' : 'Save cap'}
        </Button>
      </div>
    </form>
  );
}
