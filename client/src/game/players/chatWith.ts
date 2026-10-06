import { distanceXz, yawTowards } from '@/game/assets/geometry';
import { livePositions, OWNER_KEY, playerPositions } from '@/game/world/livePositions';
import { TALK_REACH } from '@/game/world/prompt';
import { landingBeside } from '@/game/world/seat';
import { useWorldStore } from '@/game/world/worldStore';
import { usePlayerUiStore } from './playerUiStore';

/** How far from the other player a teleport to talk lands. */
const CHAT_DISTANCE = 1.7;

/**
 * Opens the conversation with another player: at once within reach, or after a teleport to their
 * side, through the short fade, when not. A player not drawn in this world opens it where you are.
 */
export function chatWith(playerId: string, name: string): void {
  const world = useWorldStore.getState();
  const players = usePlayerUiStore.getState();
  world.setTalkingTo(null);
  const target = playerPositions.get(playerId);
  const owner = livePositions.get(OWNER_KEY);
  world.narrate(`You talk to ${name}.`);
  if (
    target === undefined ||
    (owner !== undefined && distanceXz(owner, target) <= TALK_REACH + 0.5)
  ) {
    players.setChatWith(playerId);
    return;
  }
  const landing = landingBeside(target, owner ?? target, CHAT_DISTANCE);
  world.fadeThrough(() => {
    world.requestTeleport(landing, yawTowards(landing, target));
    players.setChatWith(playerId);
  });
}
