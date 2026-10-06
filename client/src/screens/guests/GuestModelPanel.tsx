import { useState } from 'react';
import { SelectField } from '@/components/fields/SelectField';
import { Panel } from '@/components/Panel';
import { COLLECTIONS } from '@/lib/data/collections';
import { useCollection, usePreferences } from '@/lib/data/queries';
import { useSetPreference } from '@/lib/data/useSetPreference';

const OFF = '';
const SEPARATOR = '|';

/** The model every guest conversation runs on, or off while guests may not talk with agents. */
export function GuestModelPanel() {
  const { data: preferences } = usePreferences();
  const { data: providers } = useCollection(COLLECTIONS.providers);
  const setPreference = useSetPreference();
  const [error, setError] = useState<string | undefined>(undefined);
  const chosen = preferences?.guest_model ?? null;
  const value = chosen === null ? OFF : `${chosen.provider_id}${SEPARATOR}${chosen.model_id}`;
  const options = [
    { value: OFF, label: 'Off: guests cannot talk with agents' },
    ...(providers ?? []).flatMap((provider) =>
      provider.models.map((model) => ({
        value: `${provider.id}${SEPARATOR}${model.model_id}`,
        label: `${provider.name}: ${model.model_id}`,
      })),
    ),
  ];

  const choose = async (next: string): Promise<void> => {
    setError(undefined);
    const [providerId, modelId] = next.split(SEPARATOR);
    try {
      await setPreference(
        'guest_model',
        providerId === undefined || modelId === undefined || next === OFF
          ? null
          : { provider_id: providerId, model_id: modelId },
      );
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : 'The guest model was not saved.');
    }
  };

  return (
    <Panel
      title="Guest model"
      description="Guests talk with an idle agent's persona on this model, with no tools and apart from the agent's own work. Pick a small local one; nothing caps its use."
    >
      <SelectField
        label="Model for guests"
        value={value}
        options={options}
        error={error}
        onChange={(next) => void choose(next)}
      />
    </Panel>
  );
}
