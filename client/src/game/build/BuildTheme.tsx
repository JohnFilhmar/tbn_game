import { Button } from '@/components/Button';
import { ColorField } from '@/components/fields/ColorField';
import { THEME_PRESETS, THEME_SLOTS, themeColor } from '@/game/props/themes';
import { humanize } from '@/lib/format/labels';
import { useBuildStore } from './buildStore';

/**
 * The theme of the environment being built: a preset to start from, and a colour for every
 * material slot. Each change shows at once in the world and is one step of undo.
 */
export function BuildTheme() {
  const theme = useBuildStore((state) => state.history?.present.theme ?? {});
  const change = useBuildStore((state) => state.change);
  return (
    <div className="flex flex-col gap-3">
      <section aria-label="Presets" className="flex flex-col gap-1.5">
        <h3 className="text-xs font-semibold tracking-widest text-slate-300 uppercase">Presets</h3>
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(THEME_PRESETS).map(([name, preset]) => (
            <Button
              key={name}
              size="sm"
              onClick={() => change((draft) => ({ ...draft, theme: preset }))}
            >
              {name}
            </Button>
          ))}
        </div>
      </section>
      <section aria-label="Colours" className="grid grid-cols-2 gap-2">
        {THEME_SLOTS.map((slot) => (
          <ColorField
            key={slot}
            label={humanize(slot)}
            value={themeColor(theme, slot)}
            onChange={(value) =>
              change((draft) => ({ ...draft, theme: { ...draft.theme, [slot]: value } }))
            }
          />
        ))}
      </section>
    </div>
  );
}
