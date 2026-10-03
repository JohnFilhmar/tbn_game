import type { LampMode, WorldPlacement } from '@tbn/contracts';
import { useMemo, useState } from 'react';
import { Button } from '@/components/Button';
import { Dialog } from '@/components/Dialog';
import { FormError } from '@/components/FormError';
import { stateOf, type PropStates } from '@/game/objects/propStates';
import { rugArea } from '@/game/props/arrangement';
import { errorMessage } from '@/lib/api/apiError';

/** Props of `LightsDialog`. */
export interface LightsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  /** Every placement of the layout; the lamps are listed by the zone rug they hang over. */
  placements: readonly WorldPlacement[];
  states: PropStates;
  /** Saves one lamp's mode. */
  onSetMode: (lampId: string, mode: LampMode) => Promise<unknown>;
}

const MODES: { mode: LampMode; label: string }[] = [
  { mode: 'auto', label: 'Auto' },
  { mode: 'on', label: 'On' },
  { mode: 'off', label: 'Off' },
];

interface LampGroup {
  label: string;
  lamps: WorldPlacement[];
}

/** The lamps by the zone rug they hang over, in zone order, the rest last as Elsewhere. */
function groupsOf(placements: readonly WorldPlacement[]): LampGroup[] {
  const rugs = placements
    .filter((placement) => placement.kind === 'zone_rug')
    .toSorted((a, b) => (a.zone ?? 0) - (b.zone ?? 0));
  const groups = new Map<string, WorldPlacement[]>();
  for (const lamp of placements.filter((placement) => placement.kind === 'lamp')) {
    const rug = rugs.find((one) => {
      const area = rugArea(one);
      return (
        lamp.x >= area.minX && lamp.x <= area.maxX && lamp.z >= area.minZ && lamp.z <= area.maxZ
      );
    });
    const label = rug === undefined ? 'Elsewhere' : `Zone ${rug.zone ?? rugs.indexOf(rug) + 1}`;
    groups.set(label, [...(groups.get(label) ?? []), lamp]);
  }
  return [...groups.entries()]
    .map(([label, lamps]) => ({ label, lamps }))
    .toSorted((a, b) =>
      a.label === 'Elsewhere' ? 1 : b.label === 'Elsewhere' ? -1 : a.label.localeCompare(b.label),
    );
}

/**
 * The light switch's panel: each lamp by zone, on Auto (it follows the time of day), On or Off,
 * with All on, All off and All auto. Lamps follow at once; each change is kept.
 */
export function LightsDialog({
  isOpen,
  onClose,
  placements,
  states,
  onSetMode,
}: LightsDialogProps) {
  const groups = useMemo(() => groupsOf(placements), [placements]);
  const [error, setError] = useState<string | undefined>(undefined);
  const [isBusy, setIsBusy] = useState(false);

  const run = (work: Promise<unknown>): void => {
    setIsBusy(true);
    setError(undefined);
    work.catch((caught: unknown) => setError(errorMessage(caught))).finally(() => setIsBusy(false));
  };
  const setAll = (mode: LampMode): void => {
    const changes = groups
      .flatMap((group) => group.lamps)
      .filter((lamp) => stateOf.lampMode(states, lamp.id) !== mode)
      .map((lamp) => onSetMode(lamp.id, mode));
    run(Promise.all(changes));
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="Lights"
      description="Auto follows the time of day. On and Off stay as you leave them."
    >
      {groups.length === 0 ? (
        <p className="text-sm">There are no lamps here. Add some in build mode.</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => setAll('on')} disabled={isBusy}>
              All on
            </Button>
            <Button size="sm" onClick={() => setAll('off')} disabled={isBusy}>
              All off
            </Button>
            <Button size="sm" onClick={() => setAll('auto')} disabled={isBusy}>
              All auto
            </Button>
          </div>
          {groups.map((group) => (
            <section key={group.label} aria-label={group.label} className="flex flex-col gap-2">
              <h3 className="font-semibold">{group.label}</h3>
              {group.lamps.map((lamp, index) => {
                const current = stateOf.lampMode(states, lamp.id);
                const name = `${group.label}, lamp ${index + 1}`;
                return (
                  <fieldset key={lamp.id} className="flex flex-wrap items-center gap-3">
                    <legend className="sr-only">{name}</legend>
                    <span aria-hidden="true" className="w-16 text-sm">
                      Lamp {index + 1}
                    </span>
                    {MODES.map(({ mode, label }) => (
                      <label key={mode} className="flex items-center gap-1 text-sm">
                        <input
                          type="radio"
                          name={lamp.id}
                          checked={current === mode}
                          onChange={() => run(onSetMode(lamp.id, mode))}
                        />
                        {label}
                      </label>
                    ))}
                  </fieldset>
                );
              })}
            </section>
          ))}
        </>
      )}
      <FormError message={error} />
    </Dialog>
  );
}
