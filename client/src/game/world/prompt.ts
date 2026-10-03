import type { Vector3 } from 'three';
import { distanceXz, forwardOf } from '@/game/assets/geometry';

/** How close an agent must be for E to talk to it, in metres. */
export const TALK_REACH = 2;

/** What E does where the owner stands. */
export type Prompt = { kind: 'computer' } | { kind: 'agent'; agentId: string } | null;

/** Where the owner is and what is around them. */
export interface PromptScene {
  owner: Vector3;
  /** The way the owner faces; an agent behind them is out of reach. */
  facingDeg: number;
  computer: Vector3;
  computerReach: number;
  agents: ReadonlyMap<string, Vector3>;
}

/**
 * The one thing E acts on: the nearest of the computer and the agents within reach in front of
 * the owner, so the HUD shows a single prompt.
 */
export function promptAt(scene: PromptScene): Prompt {
  const [forwardX, forwardZ] = forwardOf(scene.facingDeg);
  let best: Prompt = null;
  let bestDistance = Infinity;
  const computerDistance = distanceXz(scene.owner, scene.computer);
  if (computerDistance <= scene.computerReach) {
    best = { kind: 'computer' };
    bestDistance = computerDistance;
  }
  for (const [agentId, position] of scene.agents) {
    const distance = distanceXz(scene.owner, position);
    if (distance > TALK_REACH || distance >= bestDistance) continue;
    const towards =
      distance < 0.01
        ? 1
        : ((position.x - scene.owner.x) * forwardX + (position.z - scene.owner.z) * forwardZ) /
          distance;
    if (towards <= 0) continue;
    best = { kind: 'agent', agentId };
    bestDistance = distance;
  }
  return best;
}
