import type { Camera, Vector3 } from 'three';

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

/** Where each other player is drawn right now, by player id, kept apart from the agents. */
export const playerPositions = new Map<string, Vector3>();

/**
 * Where your own character stands and what it does, written every frame, for the pose this client
 * sends the other players.
 */
export const localPose = {
  x: 0,
  y: 0,
  z: 0,
  yawDeg: 0,
  isMoving: false,
  isRunning: false,
  isPlaced: false,
};

/** The camera the world draws with, for DOM overlays that follow something in the scene. */
export const liveView: { camera: Camera | null } = { camera: null };
