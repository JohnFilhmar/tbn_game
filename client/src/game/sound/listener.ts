/** A point in the world a sound comes from. */
export interface SoundPoint {
  x: number;
  y: number;
  z: number;
}

/** The ear's height above the floor. */
const EAR_HEIGHT = 1.2;

/**
 * How a sound fades: full within a metre and a half, a third at four metres, about a tenth across
 * a ten metre room. The browser's own falloff; only the numbers are ours.
 */
const FALLOFF: PannerOptions = {
  panningModel: 'equalpower',
  distanceModel: 'inverse',
  refDistance: 1.5,
  rolloffFactor: 1.4,
  maxDistance: 80,
};

/** Where you hear from: your character, facing the way the camera looks along the floor. */
const ear = { x: 0, z: 0, forwardX: 0, forwardZ: -1 };

/** Every panner still sounding, re-placed whenever the ear moves. */
const placed = new Map<PannerNode, SoundPoint>();

/**
 * Puts `panner` where `at` is as heard from the ear. The browser's listener stays at the origin
 * facing -Z and every sound moves around it instead, which works the same in every browser.
 */
function place(panner: PannerNode, at: SoundPoint): void {
  const dx = at.x - ear.x;
  const dz = at.z - ear.z;
  panner.positionX.value = dx * -ear.forwardZ + dz * ear.forwardX;
  panner.positionY.value = at.y - EAR_HEIGHT;
  panner.positionZ.value = -(dx * ear.forwardX + dz * ear.forwardZ);
}

/** A panner at `at` that fades with distance, kept in place as the ear moves until released. */
export function placedPanner(
  context: AudioContext,
  at: SoundPoint,
): { panner: PannerNode; release: () => void } {
  const panner = new PannerNode(context, FALLOFF);
  place(panner, at);
  placed.set(panner, at);
  return {
    panner,
    release: () => {
      placed.delete(panner);
      panner.disconnect();
    },
  };
}

/**
 * Moves the ear to (`x`, `z`), facing along (`forwardX`, `forwardZ`) on the floor; a facing too
 * short to tell, as from straight above, keeps the last one.
 */
export function setEar(x: number, z: number, forwardX: number, forwardZ: number): void {
  ear.x = x;
  ear.z = z;
  const length = Math.hypot(forwardX, forwardZ);
  if (length > 0.05) {
    ear.forwardX = forwardX / length;
    ear.forwardZ = forwardZ / length;
  }
  for (const [panner, at] of placed) place(panner, at);
}
