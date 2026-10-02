import { PreferencesSchema, type Preferences } from '@tbn/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '@/components/Button';
import { SelectField } from '@/components/fields/SelectField';
import { TextField } from '@/components/fields/TextField';
import { newCommandId } from '@/lib/api/apiClient';
import { errorMessage } from '@/lib/api/apiError';
import { queryKeys } from '@/lib/data/collections';
import { numberOrNull } from '@/lib/forms/numbers';
import { validate } from '@/lib/forms/validate';
import { useApi } from '@/providers/SessionProvider';
import type { PreferenceField } from './preferenceFields';

function textOf(value: Preferences[keyof Preferences]): string {
  return value === null ? '' : String(value);
}

/** One preference with its own Save, checked against its schema before it is sent. */
export function PreferenceRow({
  field,
  preferences,
}: {
  field: PreferenceField;
  preferences: Preferences;
}) {
  const api = useApi();
  const client = useQueryClient();
  const saved = textOf(preferences[field.key]);
  const [text, setText] = useState(saved);
  const [error, setError] = useState<string | undefined>(undefined);
  const [isSaving, setIsSaving] = useState(false);
  const { kind } = field;

  const save = (value: string): void => {
    const raw = kind.type === 'number' ? numberOrNull(value) : value.trim();
    const checked = validate(PreferencesSchema.partial(), { [field.key]: raw });
    if (!checked.ok) {
      setError(checked.errors[field.key] ?? 'This value cannot be saved.');
      return;
    }
    setError(undefined);
    setIsSaving(true);
    api
      .send('PUT', `/preferences/${field.key}`, PreferencesSchema, {
        body: { value: checked.value[field.key] ?? null },
        commandId: newCommandId(),
      })
      .then((next) => client.setQueryData(queryKeys.preferences(), next))
      .catch((caught: unknown) => setError(errorMessage(caught)))
      .finally(() => setIsSaving(false));
  };

  if (kind.type === 'choice') {
    return (
      <SelectField
        label={field.label}
        hint={field.hint}
        value={saved}
        options={kind.options}
        disabled={isSaving}
        onChange={(value) => {
          setText(value);
          save(value);
        }}
        error={error}
      />
    );
  }
  return (
    <form
      className="flex items-end gap-2"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        save(text);
      }}
    >
      <TextField
        label={kind.type === 'number' ? `${field.label} (${kind.unit})` : field.label}
        hint={field.hint}
        className="flex-1"
        inputMode={kind.type === 'number' ? 'decimal' : 'text'}
        value={text}
        onChange={setText}
        error={error}
      />
      <Button type="submit" size="sm" isBusy={isSaving} disabled={text === saved}>
        Save<span className="sr-only"> {field.label}</span>
      </Button>
    </form>
  );
}
