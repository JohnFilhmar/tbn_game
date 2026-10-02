import { ToolPolicySchema } from '@tbn/contracts';
import { useId } from 'react';
import { Button } from '@/components/Button';
import { SelectField, optionsOf } from '@/components/fields/SelectField';
import { TextField } from '@/components/fields/TextField';
import type { ToolPolicyRow } from './agentDraft';
import { BUILT_IN_TOOLS } from './toolNames';

const POLICY_OPTIONS = optionsOf(ToolPolicySchema.options, (policy) =>
  policy === 'auto' ? 'Runs on its own' : policy === 'ask' ? 'Asks you first' : 'Never runs',
);

/** Props of `ToolPolicyEditor`. */
export interface ToolPolicyEditorProps {
  rows: ToolPolicyRow[];
  onChange: (rows: ToolPolicyRow[]) => void;
  /** Field errors by path, as `tool_policy.<tool>`. */
  errors: Record<string, string>;
}

/**
 * The policy of each tool the owner sets: runs on its own, asks first or never runs. A tool not
 * listed keeps its default policy.
 */
export function ToolPolicyEditor({ rows, onChange, errors }: ToolPolicyEditorProps) {
  const listId = useId();
  const update = (index: number, row: ToolPolicyRow): void =>
    onChange(rows.map((current, at) => (at === index ? row : current)));
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="text-sm font-medium text-slate-800 dark:text-slate-200">
        Tool policy
      </legend>
      <p className="text-xs text-slate-600 dark:text-slate-400">
        A tool not listed keeps its default. Web content never changes these; a run that read some
        asks you before every outward tool anyway.
      </p>
      <datalist id={listId}>
        {BUILT_IN_TOOLS.map((tool) => (
          <option key={tool} value={tool} />
        ))}
      </datalist>
      {rows.map((row, index) => (
        <div key={index} className="flex flex-wrap items-start gap-2">
          <TextField
            label={`Tool ${index + 1}`}
            className="min-w-48 flex-1"
            list={listId}
            value={row.tool}
            onChange={(tool) => update(index, { ...row, tool })}
            error={errors[`tool_policy.${row.tool.trim()}`]}
          />
          <SelectField
            label={`Policy of tool ${index + 1}`}
            value={row.policy}
            options={POLICY_OPTIONS}
            onChange={(value) => {
              const policy = ToolPolicySchema.safeParse(value);
              if (policy.success) update(index, { ...row, policy: policy.data });
            }}
          />
          <Button
            variant="ghost"
            size="sm"
            className="mt-7"
            onClick={() => onChange(rows.filter((_, at) => at !== index))}
          >
            Remove<span className="sr-only"> {row.tool || `tool ${index + 1}`}</span>
          </Button>
        </div>
      ))}
      {errors['tool_policy'] !== undefined && (
        <p className="text-xs font-medium text-red-700 dark:text-red-400">
          {errors['tool_policy']}
        </p>
      )}
      <div>
        <Button size="sm" onClick={() => onChange([...rows, { tool: '', policy: 'ask' }])}>
          Add a tool
        </Button>
      </div>
    </fieldset>
  );
}
