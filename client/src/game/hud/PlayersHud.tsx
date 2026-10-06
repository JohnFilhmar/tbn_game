import { useEffect } from 'react';
import { usePlayerUiStore } from '@/game/players/playerUiStore';
import { isTypingTarget } from '@/game/world/keyboard';
import { GuestNameDialog } from './GuestNameDialog';
import { MessageNotices } from './MessageNotices';
import { PlayerChatPanel } from './PlayerChatPanel';
import { PlayerNames } from './PlayerNames';

/** Props of `PlayersHud`. */
export interface PlayersHudProps {
  /** This client's own player id, or null until it is known. */
  myId: string | null;
  /** True while seated at the desk: only the name prompt stays. */
  isOverlayOpen: boolean;
}

/**
 * What the HUD shows of the other people in the world: their names, the pop ups of their
 * messages, the conversation with one of them, and for a new guest the name prompt.
 */
export function PlayersHud({ myId, isOverlayOpen }: PlayersHudProps) {
  const chatWith = usePlayerUiStore((state) => state.chatWith);
  const setChatWith = usePlayerUiStore((state) => state.setChatWith);

  // A conversation ends when you sit down at the desk.
  useEffect(() => {
    if (isOverlayOpen && chatWith !== null) setChatWith(null);
  }, [isOverlayOpen, chatWith, setChatWith]);

  // Escape ends a conversation from anywhere; inside the panel the panel handles it first.
  useEffect(() => {
    if (chatWith === null) return undefined;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.defaultPrevented || isTypingTarget(event.target)) return;
      setChatWith(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [chatWith, setChatWith]);

  return (
    <>
      <GuestNameDialog />
      {!isOverlayOpen && <PlayerNames />}
      {myId !== null && <MessageNotices myId={myId} isHidden={isOverlayOpen} />}
      {myId !== null && chatWith !== null && !isOverlayOpen && (
        <PlayerChatPanel playerId={chatWith} myId={myId} onClose={() => setChatWith(null)} />
      )}
    </>
  );
}
