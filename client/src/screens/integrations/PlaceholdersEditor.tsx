import type { IntegrationPlaceholder } from '@tbn/contracts';
import { Button } from '@/components/Button';
import { CheckboxField } from '@/components/fields/CheckboxField';
import { TextField } from '@/components/fields/TextField';

/** Props of `PlaceholdersEditor`. */
export interface PlaceholdersEditorProps {
  rows: IntegrationPlaceholder[];
  onChange: (rows: IntegrationPlaceholder[]) => void;
  errors: Record<string, string>;
}

/**
 * The values the agent fills in when it calls the integration. Each becomes a field of the tool's
 * input; `{{token}}` is the saved token and needs no declaration.
 */
export function PlaceholdersEditor({ rows, onChange, errors }: PlaceholdersEditorProps) {
  const update = (index: number, row: IntegrationPlaceholder): void =>
    onChange(rows.map((current, at) => (at === index ? row : current)));
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="text-sm font-medium text-slate-800 dark:text-slate-200">
        Placeholders
      </legend>
      <p className="text-xs text-slate-600 dark:text-slate-400">
        Written as {'{{name}}'} in the URL, headers or body, and escaped for the body format.
      </p>
      {rows.map((row, index) => (
        <div
          key={index}
          className="flex flex-wrap items-end gap-2 rounded-md border border-slate-200 p-3 dark:border-slate-700"
        >
          <TextField
            label={`Placeholder ${index + 1} name`}
            className="min-w-40 flex-1"
            value={row.name}
            onChange={(name) => update(index, { ...row, name })}
            error={errors[`placeholders.${index}.name`]}
          />
          <TextField
            label={`Placeholder ${index + 1} description`}
            className="min-w-48 flex-2"
            value={row.description}
            onChange={(description) => update(index, { ...row, description })}
            error={errors[`placeholders.${index}.description`]}
          />
          <CheckboxField
            label="Required"
            checked={row.required}
            onChange={(required) => update(index, { ...row, required })}
          />
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onChange(rows.filter((_, at) => at !== index))}
          >
            Remove<span className="sr-only"> placeholder {index + 1}</span>
          </Button>
        </div>
      ))}
      {errors['placeholders'] !== undefined && (
        <p className="text-xs font-medium text-red-700 dark:text-red-400">
          {errors['placeholders']}
        </p>
      )}
      <div>
        <Button
          size="sm"
          onClick={() => onChange([...rows, { name: '', description: '', required: true }])}
        >
          Add a placeholder
        </Button>
      </div>
    </fieldset>
  );
}
