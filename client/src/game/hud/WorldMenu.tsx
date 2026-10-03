import { EnvironmentNameSchema, TimeOfDaySchema, type Preferences } from '@tbn/contracts';
import { useState } from 'react';
import { Dialog } from '@/components/Dialog';
import { SelectField } from '@/components/fields/SelectField';
import { FormError } from '@/components/FormError';
import { PACKS } from '@/game/assets/packs';
import { errorMessage } from '@/lib/api/apiError';
import { useSetPreference } from '@/lib/data/useSetPreference';

/** The words for each time of day. */
export const TIME_OF_DAY_LABELS: Record<Preferences['time_of_day'], string> = {
  morning: 'Morning',
  noon: 'Noon',
  afternoon: 'Afternoon',
  night: 'Night',
  clock: 'My clock',
};

/** Props of `WorldMenu`. */
export interface WorldMenuProps {
  isOpen: boolean;
  onClose: () => void;
  preferences: Preferences;
}

/** The environment and the time of day, saved as preferences the moment they change. */
export function WorldMenu({ isOpen, onClose, preferences }: WorldMenuProps) {
  const setPreference = useSetPreference();
  const [error, setError] = useState<string | undefined>(undefined);
  const [isSaving, setIsSaving] = useState(false);

  const save = (work: Promise<unknown>): void => {
    setIsSaving(true);
    setError(undefined);
    work
      .catch((caught: unknown) => setError(errorMessage(caught)))
      .finally(() => setIsSaving(false));
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="World"
      description="Where the company is and when."
    >
      <div className="flex flex-col gap-4">
        <SelectField
          label="Environment"
          value={preferences.environment}
          disabled={isSaving}
          options={EnvironmentNameSchema.options.map((name) => ({
            value: name,
            label: PACKS[name].manifest.title,
          }))}
          onChange={(value) => {
            const parsed = EnvironmentNameSchema.safeParse(value);
            if (parsed.success) save(setPreference('environment', parsed.data));
          }}
        />
        <SelectField
          label="Time of day"
          hint="My clock follows the time zone in your preferences."
          value={preferences.time_of_day}
          disabled={isSaving}
          options={TimeOfDaySchema.options.map((value) => ({
            value,
            label: TIME_OF_DAY_LABELS[value],
          }))}
          onChange={(value) => {
            const parsed = TimeOfDaySchema.safeParse(value);
            if (parsed.success) save(setPreference('time_of_day', parsed.data));
          }}
        />
        <FormError message={error} />
      </div>
    </Dialog>
  );
}
