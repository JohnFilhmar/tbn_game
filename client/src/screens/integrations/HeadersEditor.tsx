import { Button } from '@/components/Button';
import { TextField } from '@/components/fields/TextField';
import type { HeaderRow } from './integrationDraft';

/** Props of `HeadersEditor`. */
export interface HeadersEditorProps {
  rows: HeaderRow[];
  onChange: (rows: HeaderRow[]) => void;
  error: string | undefined;
}

/** The request headers of an integration; values may hold placeholders such as `{{token}}`. */
export function HeadersEditor({ rows, onChange, error }: HeadersEditorProps) {
  const update = (index: number, row: HeaderRow): void =>
    onChange(rows.map((current, at) => (at === index ? row : current)));
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="text-sm font-medium text-slate-800 dark:text-slate-200">Headers</legend>
      {rows.map((row, index) => (
        <div key={index} className="flex flex-wrap items-end gap-2">
          <TextField
            label={`Header ${index + 1} name`}
            className="min-w-40 flex-1"
            value={row.name}
            onChange={(name) => update(index, { ...row, name })}
          />
          <TextField
            label={`Header ${index + 1} value`}
            className="min-w-48 flex-2"
            value={row.value}
            onChange={(value) => update(index, { ...row, value })}
          />
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onChange(rows.filter((_, at) => at !== index))}
          >
            Remove<span className="sr-only"> header {index + 1}</span>
          </Button>
        </div>
      ))}
      {error !== undefined && (
        <p className="text-xs font-medium text-red-700 dark:text-red-400">{error}</p>
      )}
      <div>
        <Button size="sm" onClick={() => onChange([...rows, { name: '', value: '' }])}>
          Add a header
        </Button>
      </div>
    </fieldset>
  );
}
