import { distanceXz, yawTowards } from '@/game/assets/geometry';
import { livePositions, OWNER_KEY } from './livePositions';
import { TALK_REACH } from './prompt';
import { landingBeside } from './seat';
import { useWorldStore } from './worldStore';

/**
 * Starts a conversation with an agent: at once when the owner is within reach, or after a
 * teleport to its side, through the short fade, when not. The owner's character only turns.
 */
export function talkTo(agentId: string, name: string): void {
  const store = useWorldStore.getState();
  const target = livePositions.get(agentId);
  if (target === undefined) return;
  const owner = livePositions.get(OWNER_KEY);
  store.narrate(`You talk to ${name}.`);
  if (owner !== undefined && distanceXz(owner, target) <= TALK_REACH + 0.5) {
    store.setTalkingTo(agentId);
    return;
  }
  const landing = landingBeside(target, owner ?? target);
  store.fadeThrough(() => {
    store.requestTeleport(landing, yawTowards(landing, target));
    store.setTalkingTo(agentId);
  });
}
