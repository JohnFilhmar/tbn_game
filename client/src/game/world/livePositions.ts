import type { Vector3 } from 'three';

/** The key of the owner's character in `livePositions`; agents are keyed by their id. */
export const OWNER_KEY = 'owner';

/**
 * Where each character is drawn right now, by reference: the owner's character and the agent
 * actors put their own vectors here and move them every frame, and a teleport reads them.
 * Positions are a fiction of this client; the server never knows them.
 */
// ponytail: one module-level map, fine for one world per page; move into the world store if a
// second canvas ever appears.
export const livePositions = new Map<string, Vector3>();
