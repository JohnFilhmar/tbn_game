import type { EnvironmentName } from '@tbn/contracts';
import { useNavigate } from 'react-router';
import { PACKS } from '@/game/assets/packs';
import type { LiveData } from '@/game/objects/liveData';
import { stateOf, type PropStates } from '@/game/objects/propStates';
import type { ArrangedPack } from '@/game/props/arrangedPack';
import { themeColor } from '@/game/props/themes';
import { useWorldStore } from '@/game/world/worldStore';
import { errorMessage } from '@/lib/api/apiError';
import { useSavePropState } from '@/lib/data/useSavePropState';
import { useSetPreference } from '@/lib/data/useSetPreference';
import { LightsDialog } from './LightsDialog';
import { CorkDialog, TravelDialog, TrophyDialog } from './PropPanels';
import { WhiteboardDialog } from './WhiteboardDialog';

/** Props of `PropOverlays`. */
export interface PropOverlaysProps {
  /** The pack as the owner saved it, whose props opened these. */
  arranged: ArrangedPack;
  propStates: PropStates;
  live: LiveData;
}

/**
 * Everything a prop opens over the world: drawing on a whiteboard, the light switch's panel, the
 * cork board's reports, the trophy shelf and the exit sign's choice of where to go.
 */
export function PropOverlays({ arranged, propStates, live }: PropOverlaysProps) {
  const navigate = useNavigate();
  const setPreference = useSetPreference();
  const environment = arranged.manifest.name;
  const savePropState = useSavePropState(environment);
  const drawingOn = useWorldStore((state) => state.drawingOn);
  const setDrawingOn = useWorldStore((state) => state.setDrawingOn);
  const panel = useWorldStore((state) => state.panel);
  const setPanel = useWorldStore((state) => state.setPanel);
  const fadeThrough = useWorldStore((state) => state.fadeThrough);
  const narrate = useWorldStore((state) => state.narrate);
  const showToast = useWorldStore((state) => state.showToast);
  const close = (): void => setPanel(null);

  const read = (reportId: string): void => {
    close();
    fadeThrough(() => void navigate(`/reports/${reportId}`));
  };
  const travel = (to: EnvironmentName): void => {
    close();
    narrate(`You leave for the ${PACKS[to].manifest.title.toLowerCase()}.`);
    fadeThrough(() => {
      setPreference('environment', to).catch((error: unknown) => showToast(errorMessage(error)));
    });
  };

  return (
    <>
      {drawingOn !== null && (
        <WhiteboardDialog
          key={drawingOn}
          initial={stateOf.board(propStates, drawingOn)}
          background={themeColor(arranged.theme, 'board')}
          onSave={(content) => savePropState(drawingOn, { kind: 'whiteboard', state: content })}
          onClose={() => setDrawingOn(null)}
        />
      )}
      <LightsDialog
        isOpen={panel === 'lights'}
        onClose={close}
        placements={arranged.placements}
        states={propStates}
        onSetMode={(lampId, mode) => savePropState(lampId, { kind: 'lamp', state: { mode } })}
      />
      <CorkDialog isOpen={panel === 'cork'} onClose={close} reports={live.pinned} onRead={read} />
      <TrophyDialog isOpen={panel === 'trophies'} onClose={close} milestones={live.milestones} />
      <TravelDialog
        isOpen={panel === 'travel'}
        onClose={close}
        current={environment}
        onTravel={travel}
      />
    </>
  );
}
