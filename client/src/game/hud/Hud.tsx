import { useState } from 'react';
import { useNavigate } from 'react-router';
import { ConnectionLight } from '@/app/ConnectionLight';
import { Button } from '@/components/Button';
import { yawTowards } from '@/game/assets/geometry';
import { useHotkeys } from '@/game/world/keyboard';
import { livePositions, OWNER_KEY } from '@/game/world/livePositions';
import { landingBeside } from '@/game/world/seat';
import { useWorldStore } from '@/game/world/worldStore';
import { usePreferences } from '@/lib/data/queries';
import { useSession } from '@/providers/SessionProvider';
import { CustomiseDialog } from './CustomiseDialog';
import { MOST_HOTKEYS, NarrationPanel } from './NarrationPanel';
import { useAgentRows, type AgentRow } from './useAgentRows';
import { WorldMenu } from './WorldMenu';

/** Props of `Hud`. */
export interface HudProps {
  /** True while the owner is seated at the desk; the HUD then shows nothing and its keys rest. */
  isOverlayOpen: boolean;
  packTitle: string;
}

type OpenDialog = 'world' | 'customise' | null;

const PANEL =
  'pointer-events-auto rounded-lg border-2 border-slate-700 bg-slate-900/85 text-slate-100 shadow-chunk backdrop-blur';

function Key({ children }: { children: string }) {
  return (
    <kbd className="rounded-sm border border-slate-600 bg-slate-800 px-1 font-display text-slate-100">
      {children}
    </kbd>
  );
}

/**
 * What lies over the canvas: the live light and the pack, the buttons for the desk, the camera,
 * the world menu and customisation, the controls help, the computer prompt, and the narration with
 * a way to go to each agent. The Desk button sits the owner at the computer from anywhere, through
 * a short fade; E does it without one within reach of the computer.
 */
export function Hud({ isOverlayOpen, packTitle }: HudProps) {
  const navigate = useNavigate();
  const { signOut } = useSession();
  const { data: preferences } = usePreferences();
  const cameraMode = useWorldStore((state) => state.cameraMode);
  const toggleCamera = useWorldStore((state) => state.toggleCamera);
  const canUseComputer = useWorldStore((state) => state.canUseComputer);
  const isReady = useWorldStore((state) => state.isReady);
  const fps = useWorldStore((state) => state.fps);
  const isFpsShown = useWorldStore((state) => state.isFpsShown);
  const toggleFps = useWorldStore((state) => state.toggleFps);
  const lastDesktopPath = useWorldStore((state) => state.lastDesktopPath);
  const fadeThrough = useWorldStore((state) => state.fadeThrough);
  const requestTeleport = useWorldStore((state) => state.requestTeleport);
  const narrate = useWorldStore((state) => state.narrate);
  const rows = useAgentRows();
  const [openDialog, setOpenDialog] = useState<OpenDialog>(null);

  const sitDown = (): void => {
    if (canUseComputer) void navigate(lastDesktopPath);
    else fadeThrough(() => void navigate(lastDesktopPath));
  };
  const goTo = (row: AgentRow): void => {
    const target = livePositions.get(row.agentId);
    if (target === undefined) return;
    const landing = landingBeside(target, livePositions.get(OWNER_KEY) ?? target);
    fadeThrough(() => requestTeleport(landing, yawTowards(landing, target)));
    narrate(`You go to ${row.name}.`);
  };
  const agentKeys = Object.fromEntries(
    rows.slice(0, MOST_HOTKEYS).map((row, index) => [`Digit${index + 1}`, () => goTo(row)]),
  );
  useHotkeys(!isOverlayOpen && openDialog === null, {
    ...agentKeys,
    KeyC: toggleCamera,
    KeyE: () => {
      if (canUseComputer) sitDown();
    },
    F3: toggleFps,
  });

  if (isOverlayOpen) return null;
  return (
    <>
      {/* The HUD always wears the dark theme: it sits over the world, not on a page. */}
      <div className="dark pointer-events-none absolute inset-0 flex flex-col justify-between gap-3 p-3">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className={`${PANEL} flex items-center gap-3 px-3 py-2 text-sm`}>
            <span className="font-display text-base font-bold tracking-widest uppercase">tbn</span>
            <ConnectionLight />
            <span className="font-display font-semibold">{packTitle}</span>
            {isFpsShown && (
              <span role="status" className="text-xs text-slate-300">
                {fps} fps
              </span>
            )}
          </div>
          <div className={`${PANEL} flex flex-wrap gap-2 p-2`}>
            <Button size="sm" variant="primary" onClick={sitDown} title="Sit at the computer">
              Desk
            </Button>
            <Button
              size="sm"
              onClick={toggleCamera}
              aria-pressed={cameraMode === 'top_down'}
              aria-label={`Camera: ${cameraMode === 'top_down' ? 'top down' : 'third person'}`}
            >
              Camera: {cameraMode === 'top_down' ? 'top down' : 'third person'}
            </Button>
            <Button size="sm" onClick={() => setOpenDialog('world')}>
              World
            </Button>
            <Button size="sm" onClick={() => setOpenDialog('customise')}>
              Customise
            </Button>
            <Button size="sm" variant="ghost" onClick={() => void signOut()}>
              Sign out
            </Button>
          </div>
        </header>
        <footer className="flex flex-wrap items-end justify-between gap-3">
          <div
            className={`${PANEL} flex max-w-sm flex-col gap-1.5 px-3 py-2 text-xs text-slate-300`}
          >
            {canUseComputer && (
              <p className="font-display text-sm font-semibold text-teal-300">
                Press E to use the computer
              </p>
            )}
            <p className="leading-relaxed">
              <Key>WASD</Key> walk · <Key>Shift</Key> run · drag look · wheel zoom · <Key>C</Key>{' '}
              camera · <Key>E</Key> sit · <Key>1-9</Key> go to an agent · <Key>F3</Key> frame rate
            </p>
            <p role="status" className={isReady ? 'sr-only' : undefined}>
              {isReady ? 'The world is ready.' : 'Loading the world…'}
            </p>
          </div>
          <NarrationPanel rows={rows} onGo={goTo} />
        </footer>
      </div>
      {/* The dialogs sit outside the overlay, which lets pointer events through to the canvas. */}
      {preferences !== undefined && (
        <>
          <WorldMenu
            isOpen={openDialog === 'world'}
            onClose={() => setOpenDialog(null)}
            preferences={preferences}
          />
          <CustomiseDialog
            isOpen={openDialog === 'customise'}
            onClose={() => setOpenDialog(null)}
            appearance={preferences.owner_appearance}
          />
        </>
      )}
    </>
  );
}
