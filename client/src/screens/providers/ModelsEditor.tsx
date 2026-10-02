import { CostTierSchema } from '@tbn/contracts';
import { Button } from '@/components/Button';
import { SelectField, optionsOf } from '@/components/fields/SelectField';
import { TextField } from '@/components/fields/TextField';
import { humanize } from '@/lib/format/labels';
import { EMPTY_MODEL, type ModelDraft } from './providerDraft';

const TIER_OPTIONS = optionsOf(CostTierSchema.options, humanize);

const PRICES: ReadonlyArray<{ key: keyof ModelDraft; label: string }> = [
  { key: 'input_price_per_million', label: 'Input price' },
  { key: 'output_price_per_million', label: 'Output price' },
  { key: 'cache_read_price_per_million', label: 'Cache read price' },
  { key: 'cache_write_price_per_million', label: 'Cache write price' },
];

/** Props of `ModelsEditor`. */
export interface ModelsEditorProps {
  models: ModelDraft[];
  onChange: (models: ModelDraft[]) => void;
  errors: Record<string, string>;
}

/** The models a provider offers, with their tier, prices per million tokens and limits. */
export function ModelsEditor({ models, onChange, errors }: ModelsEditorProps) {
  const update = (index: number, key: keyof ModelDraft, value: string): void =>
    onChange(models.map((model, at) => (at === index ? { ...model, [key]: value } : model)));
  return (
    <fieldset className="flex flex-col gap-4">
      <legend className="text-sm font-medium text-slate-800 dark:text-slate-200">Models</legend>
      <p className="text-xs text-slate-600 dark:text-slate-400">
        Prices are per million tokens, in the unit you pay in; caps and spend use them. Leave a
        price empty when you do not know it.
      </p>
      {errors['models'] !== undefined && (
        <p className="text-xs font-medium text-red-700 dark:text-red-400">{errors['models']}</p>
      )}
      {models.map((model, index) => {
        const at = (key: string): string | undefined => errors[`models.${index}.${key}`];
        const name = model.model_id.trim() || `model ${index + 1}`;
        return (
          <div
            key={index}
            className="flex flex-col gap-3 rounded-md border border-slate-200 p-3 dark:border-slate-700"
          >
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <TextField
                label={`Model id ${index + 1}`}
                className="md:col-span-2"
                placeholder="claude-sonnet-5-5"
                value={model.model_id}
                onChange={(value) => update(index, 'model_id', value)}
                error={at('model_id')}
              />
              <SelectField
                label={`Cost tier of ${name}`}
                value={model.cost_tier}
                options={TIER_OPTIONS}
                onChange={(value) => update(index, 'cost_tier', value)}
                error={at('cost_tier')}
              />
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
              {PRICES.map((price) => (
                <TextField
                  key={price.key}
                  label={`${price.label} of ${name}`}
                  inputMode="decimal"
                  value={model[price.key]}
                  onChange={(value) => update(index, price.key, value)}
                  error={at(price.key)}
                />
              ))}
              <TextField
                label={`Max output tokens of ${name}`}
                inputMode="numeric"
                placeholder="8192"
                value={model.max_output_tokens}
                onChange={(value) => update(index, 'max_output_tokens', value)}
                error={at('max_output_tokens')}
              />
              <TextField
                label={`Context window of ${name}`}
                inputMode="numeric"
                placeholder="128000"
                value={model.context_window_tokens}
                onChange={(value) => update(index, 'context_window_tokens', value)}
                error={at('context_window_tokens')}
              />
            </div>
            {models.length > 1 && (
              <div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onChange(models.filter((_, other) => other !== index))}
                >
                  Remove {name}
                </Button>
              </div>
            )}
          </div>
        );
      })}
      <div>
        <Button size="sm" onClick={() => onChange([...models, EMPTY_MODEL])}>
          Add a model
        </Button>
      </div>
    </fieldset>
  );
}
