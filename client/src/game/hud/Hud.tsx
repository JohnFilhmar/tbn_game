import { useState } from 'react';
import { useNavigate } from 'react-router';
import { ConnectionLight } from '@/app/ConnectionLight';
import { Button } from '@/components/Button';
import { useHotkeys } from '@/game/world/keyboard';
import { useWorldStore } from '@/game/world/worldStore';
import { usePreferences } from '@/lib/data/queries';
import { useSession } from '@/providers/SessionProvider';
import { CustomiseDialog } from './CustomiseDialog';
import { NarrationPanel } from './NarrationPanel';
import { WorldMenu } from './WorldMenu';

/** Props of `Hud`. */
export interface HudProps {
  /** True while the desk covers the world; the HUD then shows nothing and its keys rest. */
  isOverlayOpen: boolean;
  packTitle: string;
}

type OpenDialog = 'world' | 'customise' | null;

const PANEL = 'pointer-events-auto rounded-lg bg-slate-950/70 text-slate-100 backdrop-blur';

/**
 * What lies over the canvas: the live light and the pack, the buttons for the desk, the camera,
 * the world menu and customisation, the controls help, the computer prompt, and the narration.
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
  const lastDesktopPath = useWorldStore((state) => state.lastDesktopPath);
  const [openDialog, setOpenDialog] = useState<OpenDialog>(null);

  const openDesk = (): void => void navigate(lastDesktopPath);
  useHotkeys(!isOverlayOpen && openDialog === null, {
    KeyC: toggleCamera,
    KeyE: () => {
      if (canUseComputer) openDesk();
    },
  });

  if (isOverlayOpen) return null;
  return (
    <>
      <div className="pointer-events-none absolute inset-0 flex flex-col justify-between gap-3 p-3">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className={`${PANEL} flex items-center gap-3 px-3 py-2 text-sm`}>
            <span className="font-semibold tracking-tight">tbn</span>
            <span className="rounded bg-white/90 px-1.5 py-0.5">
              <ConnectionLight />
            </span>
            <span>{packTitle}</span>
            <span role="status" className="text-xs text-slate-300">
              {fps} fps
            </span>
          </div>
          <div className={`${PANEL} flex flex-wrap gap-2 p-2`}>
            <Button size="sm" variant="primary" onClick={openDesk}>
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
            <Button
              size="sm"
              variant="ghost"
              className="text-slate-100"
              onClick={() => void signOut()}
            >
              Sign out
            </Button>
          </div>
        </header>
        <footer className="flex flex-wrap items-end justify-between gap-3">
          <div className={`${PANEL} flex max-w-sm flex-col gap-1 px-3 py-2 text-xs text-slate-300`}>
            {canUseComputer && (
              <p className="text-sm font-medium text-slate-100">Press E to use the computer</p>
            )}
            <p>WASD or arrows: walk. Shift: run. Drag: look. Wheel: zoom. C: camera. E: use.</p>
            <p role="status" className={isReady ? 'sr-only' : undefined}>
              {isReady ? 'The world is ready.' : 'Loading the world…'}
            </p>
          </div>
          <NarrationPanel />
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
