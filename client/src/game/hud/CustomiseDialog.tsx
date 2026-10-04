import type { Appearance } from '@tbn/contracts';
import { lazy, Suspense, useMemo, useState } from 'react';
import { Button } from '@/components/Button';
import { Dialog } from '@/components/Dialog';
import { ColorField } from '@/components/fields/ColorField';
import { SelectField } from '@/components/fields/SelectField';
import { FormError } from '@/components/FormError';
import { resolveAppearance } from '@/game/assets/appearance';
import { PaletteSlotSchema, type PartKind } from '@/game/assets/characterManifest';
import { bodyNames, CHARACTER_SET, partNames } from '@/game/assets/characters';
import { canRenderWorld } from '@/game/world/webgl';
import { errorMessage } from '@/lib/api/apiError';
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
  onSave: (appearance: Appearance) => Promise<unknown>;
  onSaved: () => void;
}

function CustomiseForm({ initial, onSave, onSaved }: CustomiseFormProps) {
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
    onSave(draft)
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
  title: string;
  /** The look the form starts from: the saved one, or the default the world shows. */
  initial: Appearance;
  /** Saves the chosen look: the owner's preference, or an agent's profile. */
  onSave: (appearance: Appearance) => Promise<unknown>;
}

/**
 * A character's look, the owner's or an agent's: parts and colours from the set, with a live
 * preview. The world dresses the character in it as soon as it is saved.
 */
export function CustomiseDialog({ isOpen, onClose, title, initial, onSave }: CustomiseDialogProps) {
  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      description="Parts and colours from the character set."
    >
      {isOpen && <CustomiseForm initial={initial} onSave={onSave} onSaved={onClose} />}
    </Dialog>
  );
}
