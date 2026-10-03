import type { Appearance } from '@tbn/contracts';
import { lazy, Suspense, useMemo, useState } from 'react';
import { Button } from '@/components/Button';
import { Dialog } from '@/components/Dialog';
import { ColorField } from '@/components/fields/ColorField';
import { SelectField } from '@/components/fields/SelectField';
import { FormError } from '@/components/FormError';
import { ownerAppearanceOf, resolveAppearance } from '@/game/assets/appearance';
import { PaletteSlotSchema, type PartKind } from '@/game/assets/characterManifest';
import { bodyNames, CHARACTER_SET, partNames } from '@/game/assets/characters';
import { canRenderWorld } from '@/game/world/webgl';
import { errorMessage } from '@/lib/api/apiError';
import { useSetPreference } from '@/lib/data/useSetPreference';
import { humanize } from '@/lib/format/labels';

const LazyPreview = lazy(() =>
  import('./CharacterPreview').then((module) => ({ default: module.CharacterPreview })),
);

const PART_LABELS: Record<PartKind, string> = {
  hair: 'Hair',
  outfit: 'Outfit',
  accessory: 'Accessory',
};
const SLOT_LABELS = {
  skin: 'Skin',
  hair: 'Hair colour',
  top: 'Top',
  bottom: 'Bottom',
  shoes: 'Shoes',
  accent: 'Accent',
} as const;

interface CustomiseFormProps {
  initial: Appearance;
  onSaved: () => void;
}

function CustomiseForm({ initial, onSaved }: CustomiseFormProps) {
  const setPreference = useSetPreference();
  const [draft, setDraft] = useState<Appearance>(initial);
  const [error, setError] = useState<string | undefined>(undefined);
  const [isSaving, setIsSaving] = useState(false);
  const resolved = useMemo(() => resolveAppearance(CHARACTER_SET, draft), [draft]);
  const canPreview = useMemo(() => canRenderWorld(), []);

  const setPart = (kind: PartKind, value: string): void => {
    setDraft((current) => ({ ...current, [kind]: value.length > 0 ? value : undefined }));
  };
  const save = (): void => {
    setIsSaving(true);
    setError(undefined);
    setPreference('owner_appearance', draft)
      .then(onSaved)
      .catch((caught: unknown) => setError(errorMessage(caught)))
      .finally(() => setIsSaving(false));
  };

  return (
    <form
      className="flex flex-col gap-4"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      {canPreview && (
        <Suspense
          fallback={<div className="h-64 w-full rounded-md bg-slate-200 dark:bg-slate-800" />}
        >
          <LazyPreview appearance={resolved} />
        </Suspense>
      )}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <SelectField
          label="Body"
          value={resolved.body.name}
          options={bodyNames(CHARACTER_SET).map((name) => ({ value: name, label: humanize(name) }))}
          onChange={(value) => setDraft((current) => ({ ...current, body: value }))}
        />
        {(['hair', 'outfit', 'accessory'] satisfies PartKind[]).map((kind) => (
          <SelectField
            key={kind}
            label={PART_LABELS[kind]}
            value={draft[kind] ?? ''}
            placeholder="None"
            options={partNames(CHARACTER_SET, kind).map((name) => ({
              value: name,
              label: humanize(name),
            }))}
            onChange={(value) => setPart(kind, value)}
          />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-4 md:grid-cols-6">
        {PaletteSlotSchema.options.map((slot) => (
          <ColorField
            key={slot}
            label={SLOT_LABELS[slot]}
            value={resolved.colors[slot]}
            onChange={(value) =>
              setDraft((current) => ({ ...current, colors: { ...current.colors, [slot]: value } }))
            }
          />
        ))}
      </div>
      <FormError message={error} />
      <div className="flex justify-end gap-2">
        <Button type="submit" variant="primary" isBusy={isSaving}>
          Save
        </Button>
      </div>
    </form>
  );
}

/** Props of `CustomiseDialog`. */
export interface CustomiseDialogProps {
  isOpen: boolean;
  onClose: () => void;
  /** The owner's saved appearance. */
  appearance: Appearance | undefined;
}

/** The owner's character: parts and colours from the set, with a live preview, saved as a preference. */
export function CustomiseDialog({ isOpen, onClose, appearance }: CustomiseDialogProps) {
  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="Customise your character"
      description="Parts and colours from the character set. Agents are dressed from their profiles."
    >
      <CustomiseForm initial={ownerAppearanceOf(appearance)} onSaved={onClose} />
    </Dialog>
  );
}
