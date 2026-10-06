import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { ConnectionLight } from '@/app/ConnectionLight';
import { Button } from '@/components/Button';
import { yawTowards } from '@/game/assets/geometry';
import type { LiveData } from '@/game/objects/liveData';
import type { PropStates } from '@/game/objects/propStates';
import type { ArrangedPack } from '@/game/props/arrangedPack';
import { isTypingTarget, useHotkeys } from '@/game/world/keyboard';
import { livePositions, OWNER_KEY } from '@/game/world/livePositions';
import { talkTo } from '@/game/world/talk';
import { chatWith } from '@/game/players/chatWith';
import { usePlayerUiStore } from '@/game/players/playerUiStore';
import { usePlayersStore } from '@/lib/stores/playersStore';
import { landingBeside } from '@/game/world/seat';
import { useWorldStore } from '@/game/world/worldStore';
import { usePreferences } from '@/lib/data/queries';
import { useSetPreference } from '@/lib/data/useSetPreference';
import { ownerAppearanceOf } from '@/game/assets/appearance';
import { useSession } from '@/providers/SessionProvider';
import { ControlsHelp } from './ControlsHelp';
import { ConversationPanel } from './ConversationPanel';
import { CustomiseDialog } from './CustomiseDialog';
import { MOST_HOTKEYS, NarrationPanel } from './NarrationPanel';
import { PropOverlays } from './PropOverlays';
import { PropReach } from './PropReach';
import { SpeechBubble } from './SpeechBubble';
import { useAgentRows, type AgentRow } from './useAgentRows';
import { propVerb, useInteract } from './useInteract';
import { WorldMenu } from './WorldMenu';
import { WorldToast } from './WorldToast';

/** Props of `Hud`. */
export interface HudProps {
  /** True while the owner is seated at the desk; the HUD then shows nothing and its keys rest. */
  isOverlayOpen: boolean;
  packTitle: string;
  /** Opens build mode on the environment shown. */
  onBuild: () => void;
  /** The pack as the owner saved it: its props are what E uses. */
  arranged: ArrangedPack;
  /** The saved state of each prop that keeps one. */
  propStates: PropStates;
  /** What the company's objects show: the inbox, the cork board, the trophies. */
  live: LiveData;
}

type OpenDialog = 'world' | 'customise' | null;

const PANEL =
  'pointer-events-auto rounded-lg border-2 border-slate-700 bg-slate-900/85 text-slate-100 shadow-chunk backdrop-blur';

/**
 * What lies over the canvas: the live light and the pack, the buttons for the desk, the camera,
 * the world menu and customisation, the controls help, the computer prompt, and the narration with
 * a way to go to each agent. The Desk button sits the owner at the computer from anywhere, through
 * a short fade; E does it without one within reach of the computer.
 */
export function Hud({ isOverlayOpen, packTitle, onBuild, arranged, propStates, live }: HudProps) {
  const navigate = useNavigate();
  const { signOut, guest } = useSession();
  const guestOf = guest?.owner_username ?? null;
  const nearPlayerId = usePlayerUiStore((state) => state.nearPlayerId);
  const chatPartner = usePlayerUiStore((state) => state.chatWith);
  const unstuck = usePlayerUiStore((state) => state.unstuck);
  const nearPlayer = usePlayersStore((state) =>
    nearPlayerId === null ? undefined : state.players[nearPlayerId],
  );
  const { data: preferences } = usePreferences();
  const setPreference = useSetPreference();
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
  const nearAgentId = useWorldStore((state) => state.nearAgentId);
  const talkingTo = useWorldStore((state) => state.talkingTo);
  const setTalkingTo = useWorldStore((state) => state.setTalkingTo);
  const nearPropId = useWorldStore((state) => state.nearPropId);
  const reachablePropIds = useWorldStore((state) => state.reachablePropIds);
  const drawingOn = useWorldStore((state) => state.drawingOn);
  const setDrawingOn = useWorldStore((state) => state.setDrawingOn);
  const panel = useWorldStore((state) => state.panel);
  const setPanel = useWorldStore((state) => state.setPanel);
  const [openDialog, setOpenDialog] = useState<OpenDialog>(null);
  const { placements } = arranged;
  const host = useMemo(
    () => ({
      openDesk: (path: string) => fadeThrough(() => void navigate(path)),
      openWorldMenu: () => setOpenDialog('world'),
      guestOf,
    }),
    [fadeThrough, navigate, guestOf],
  );
  const interact = useInteract(placements, propStates, arranged.manifest.name, host);
  const nearProp = placements.find((placement) => placement.id === nearPropId);
  const nearVerb = nearProp === undefined ? null : propVerb(nearProp, propStates);
  const rows = useAgentRows();
  const nearAgent = rows.find((row) => row.agentId === nearAgentId);
  const isPartnerHere = rows.some((row) => row.agentId === talkingTo);

  // Escape ends a conversation from anywhere; inside the panel the panel handles it first.
  useEffect(() => {
    if (talkingTo === null) return undefined;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.defaultPrevented || isTypingTarget(event.target)) return;
      setTalkingTo(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [talkingTo, setTalkingTo]);

  // Drawing and the props' panels end when the owner sits down.
  useEffect(() => {
    if (!isOverlayOpen) return;
    setDrawingOn(null);
    setPanel(null);
  }, [isOverlayOpen, setDrawingOn, setPanel]);

  // A conversation ends when the owner sits down, or when the agent leaves the world.
  useEffect(() => {
    if (talkingTo !== null && (isOverlayOpen || !isPartnerHere)) setTalkingTo(null);
  }, [talkingTo, isOverlayOpen, isPartnerHere, setTalkingTo]);

  const talk = (row: AgentRow): void => talkTo(row.agentId, row.name);
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
  const isBusy = talkingTo !== null || drawingOn !== null || panel !== null || chatPartner !== null;
  useHotkeys(!isOverlayOpen && openDialog === null && !isBusy, {
    ...agentKeys,
    KeyC: toggleCamera,
    KeyE: () => {
      if (nearAgent !== undefined) talk(nearAgent);
      else if (nearPlayer !== undefined) chatWith(nearPlayer.id, nearPlayer.name);
      else if (nearPropId !== null) interact(nearPropId);
      else if (canUseComputer) sitDown();
    },
    KeyU: () => {
      unstuck();
      narrate('You are back at the entrance.');
    },
    F3: toggleFps,
    ...(guestOf === null && { KeyB: onBuild }),
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
            {guestOf === null && (
              <>
                <Button size="sm" onClick={() => setOpenDialog('world')}>
                  World
                </Button>
                <Button size="sm" onClick={onBuild} title="Arrange and paint this place (B)">
                  Build
                </Button>
                <Button size="sm" onClick={() => setOpenDialog('customise')}>
                  Customise
                </Button>
                <Button size="sm" variant="ghost" onClick={() => void signOut()}>
                  Sign out
                </Button>
              </>
            )}
          </div>
        </header>
        {talkingTo === null && drawingOn === null && (
          <footer className="flex flex-wrap items-end justify-between gap-3">
            <div
              className={`${PANEL} flex max-w-sm flex-col gap-1.5 px-3 py-2 text-xs text-slate-300`}
            >
              {nearAgent !== undefined && (
                <p className="font-display text-sm font-semibold text-teal-300">
                  Press E to talk to {nearAgent.name}
                </p>
              )}
              {nearAgent === undefined && nearPlayer !== undefined && (
                <p className="font-display text-sm font-semibold text-teal-300">
                  Press E to talk to {nearPlayer.name}
                </p>
              )}
              {nearVerb !== null && (
                <p className="font-display text-sm font-semibold text-teal-300">
                  Press E to {nearVerb}
                </p>
              )}
              {canUseComputer && (
                <p className="font-display text-sm font-semibold text-teal-300">
                  Press E to use the computer
                </p>
              )}
              <PropReach
                propIds={reachablePropIds}
                placements={placements}
                states={propStates}
                onUse={interact}
              />
              <ControlsHelp />
              <p role="status" className={isReady ? 'sr-only' : undefined}>
                {isReady ? 'The world is ready.' : 'Loading the world…'}
              </p>
            </div>
            <NarrationPanel rows={rows} onGo={goTo} onTalk={talk} />
          </footer>
        )}
      </div>
      <WorldToast />
      <PropOverlays arranged={arranged} propStates={propStates} live={live} />
      {talkingTo !== null && (
        <>
          {guestOf === null && <SpeechBubble agentId={talkingTo} />}
          <ConversationPanel agentId={talkingTo} onClose={() => setTalkingTo(null)} />
        </>
      )}
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
            title="Customise your character"
            initial={ownerAppearanceOf(preferences.owner_appearance)}
            onSave={(appearance) => setPreference('owner_appearance', appearance)}
          />
        </>
      )}
    </>
  );
}
