import type { Vector3 } from 'three';
import { distanceXz, forwardOf } from '@/game/assets/geometry';

/** How close an agent must be for E to talk to it, in metres. */
export const TALK_REACH = 2;

/** What E does where the owner stands. */
export type Prompt =
  | { kind: 'computer' }
  | { kind: 'agent'; agentId: string }
  | { kind: 'player'; playerId: string }
  | { kind: 'prop'; placementId: string }
  | null;

/** A prop the owner could use: where it stands on the floor and how close they must be. */
export interface UsableProp {
  placementId: string;
  x: number;
  z: number;
  reach: number;
}

/** Where the owner is and what is around them. */
export interface PromptScene {
  owner: Vector3;
  /** The way the owner faces; an agent or a prop behind them is out of reach. */
  facingDeg: number;
  computer: Vector3;
  computerReach: number;
  agents: ReadonlyMap<string, Vector3>;
  /** The other players, by id. */
  players?: ReadonlyMap<string, Vector3>;
  props: readonly UsableProp[];
}

/** How far the owner stands from a floor point. */
function distanceTo(owner: Vector3, x: number, z: number): number {
  return Math.hypot(x - owner.x, z - owner.z);
}

/**
 * The one thing E acts on: the nearest of the computer, the agents and the props within reach in
 * front of the owner, so the HUD shows a single prompt. The computer, in reach, beats every prop.
 */
export function promptAt(scene: PromptScene): Prompt {
  const [forwardX, forwardZ] = forwardOf(scene.facingDeg);
  const isInFront = (x: number, z: number, distance: number): boolean =>
    distance < 0.01 ||
    ((x - scene.owner.x) * forwardX + (z - scene.owner.z) * forwardZ) / distance > 0;
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
    if (!isInFront(position.x, position.z, distance)) continue;
    best = { kind: 'agent', agentId };
    bestDistance = distance;
  }
  // Another player never takes E from the computer either: a guest may sit in its chair.
  for (const [playerId, position] of best?.kind === 'computer' ? [] : (scene.players ?? [])) {
    const distance = distanceXz(scene.owner, position);
    if (distance > TALK_REACH || distance >= bestDistance) continue;
    if (!isInFront(position.x, position.z, distance)) continue;
    best = { kind: 'player', playerId };
    bestDistance = distance;
  }
  // A prop never takes E from the computer, such as the inbox tray on the computer's own desk.
  if (best?.kind === 'computer') return best;
  for (const prop of scene.props) {
    const distance = distanceTo(scene.owner, prop.x, prop.z);
    if (distance > prop.reach || distance >= bestDistance) continue;
    if (!isInFront(prop.x, prop.z, distance)) continue;
    best = { kind: 'prop', placementId: prop.placementId };
    bestDistance = distance;
  }
  return best;
}

/**
 * Every prop within its reach of the owner, nearest first, whichever way they face: the HUD lists
 * them as buttons, so each one can be used without the canvas.
 */
export function propsInReach(owner: Vector3, props: readonly UsableProp[]): string[] {
  return props
    .map((prop) => ({ id: prop.placementId, distance: distanceTo(owner, prop.x, prop.z), prop }))
    .filter((entry) => entry.distance <= entry.prop.reach)
    .toSorted((a, b) => a.distance - b.distance)
    .map((entry) => entry.id);
}
