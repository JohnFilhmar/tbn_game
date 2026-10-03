import type { WorldPlacement } from '@tbn/contracts';
import { Button } from '@/components/Button';
import { ColorField } from '@/components/fields/ColorField';
import { SelectField, optionsOf } from '@/components/fields/SelectField';
import { TextField } from '@/components/fields/TextField';
import { PROP_CATALOG } from '@/game/props/catalog';
import { sizeOf, variantOf } from '@/game/props/propModel';
import { themeColor } from '@/game/props/themes';
import { humanize } from '@/lib/format/labels';
import { useBuildStore } from './buildStore';
import { turned, withPlacement, withoutPlacement } from './draft';

/** Props of `BuildSelection`. */
export interface BuildSelectionProps {
  placement: WorldPlacement;
}

const ZONES = ['1', '2', '3', '4', '5', '6', '7', '8'];

function metres(value: string, fallback: number): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed >= 0.25 && parsed <= 24 ? parsed : fallback;
}

/**
 * The selected prop: pick it up to move it, turn it, size it, choose its variant, repaint it,
 * number a zone rug's department, or remove it. The computer can move but never be removed.
 */
export function BuildSelection({ placement }: BuildSelectionProps) {
  const change = useBuildStore((state) => state.change);
  const hold = useBuildStore((state) => state.hold);
  const theme = useBuildStore((state) => state.history?.present.theme ?? {});
  const spec = PROP_CATALOG[placement.kind];
  const size = sizeOf(placement);
  const update = (next: WorldPlacement): void => change((draft) => withPlacement(draft, next));
  return (
    <section aria-label={`Selected: ${spec.label}`} className="flex flex-col gap-3">
      <h3 className="font-display text-base font-semibold">{spec.label}</h3>
      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" onClick={() => hold(placement)} title="Pick it up and drop it elsewhere">
          Move
        </Button>
        <Button size="sm" onClick={() => update(turned(placement))} title="Turn a quarter (R)">
          Turn
        </Button>
        {placement.kind !== 'computer_desk' && (
          <Button
            size="sm"
            variant="danger"
            title="Remove (Delete)"
            onClick={() => change((draft) => withoutPlacement(draft, placement.id))}
          >
            Remove
          </Button>
        )}
      </div>
      {spec.size !== null && (
        <div className="grid grid-cols-2 gap-2">
          <TextField
            label="Width (m)"
            type="number"
            step="0.25"
            value={String(size.width)}
            onChange={(value) => update({ ...placement, width: metres(value, size.width) })}
          />
          {placement.kind !== 'partition' && (
            <TextField
              label="Depth (m)"
              type="number"
              step="0.25"
              value={String(size.depth)}
              onChange={(value) => update({ ...placement, depth: metres(value, size.depth) })}
            />
          )}
        </div>
      )}
      {spec.variants.length > 1 && (
        <SelectField
          label="Finish"
          value={variantOf(placement)}
          options={optionsOf(spec.variants, humanize)}
          onChange={(value) => update({ ...placement, variant: value })}
        />
      )}
      {placement.kind === 'zone_rug' && (
        <SelectField
          label="Department"
          value={String(placement.zone ?? 1)}
          options={optionsOf(ZONES, (zone) => `Zone ${zone}`)}
          onChange={(value) => update({ ...placement, zone: Number(value) })}
        />
      )}
      {spec.colorSlot !== null && (
        <div className="flex items-end gap-2">
          <ColorField
            label="Colour"
            value={placement.color ?? themeColor(theme, spec.colorSlot)}
            onChange={(value) => update({ ...placement, color: value })}
          />
          {placement.color !== null && (
            <Button size="sm" variant="ghost" onClick={() => update({ ...placement, color: null })}>
              Theme colour
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
