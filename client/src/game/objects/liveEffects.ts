import type { EffectKind } from '@/game/props/interactions';

/** One burst of steam, bubbles or blades, where it starts and when, in seconds. */
export interface LiveEffect {
  kind: EffectKind;
  x: number;
  y: number;
  z: number;
  bornAt: number;
}

/** How long a burst lives, in seconds. */
export const EFFECT_SECONDS = 2;
/** The most bursts alive at once; a new one pushes out the oldest. */
export const MOST_EFFECTS = 16;

/** The height a burst starts at above the floor, by kind. */
const START_HEIGHT: Record<EffectKind, number> = { steam: 1.2, bubbles: 1.3, blades: 0.15 };

/** The bursts alive now; the effects in the scene read it every frame, so it never re-renders. */
export const liveEffects: LiveEffect[] = [];

/** Starts a burst of `kind` above the floor point (`x`, `z`). */
export function emitEffect(kind: EffectKind, x: number, z: number): void {
  liveEffects.push({ kind, x, y: START_HEIGHT[kind], z, bornAt: performance.now() / 1000 });
  if (liveEffects.length > MOST_EFFECTS) liveEffects.shift();
}
