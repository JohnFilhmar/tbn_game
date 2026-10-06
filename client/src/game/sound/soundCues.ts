import type { EnvironmentName, SoundCue, SoundCueName } from '@tbn/contracts';
import type { EffectKind } from '@/game/props/interactions';
import { sendCue } from '@/lib/realtime/presenceChannel';
import type { SoundPoint } from './listener';
import { playSound } from './soundEngine';

/** The sound each burst makes when an agent uses a prop. */
export const EFFECT_SOUNDS: Record<EffectKind, SoundCueName> = {
  steam: 'pour',
  bubbles: 'bubble',
  blades: 'rustle',
  drops: 'sprinkle',
};

// ponytail: one module-level environment, as a page shows one world at a time.
let heard: EnvironmentName | null = null;

/** Sets the environment this page shows; only its sounds are heard. */
export function setHeardEnvironment(environment: EnvironmentName | null): void {
  heard = environment;
}

/** Plays a sound you made at `at` and sends it to the other players in the same environment. */
export function cueSound(sound: SoundCueName, at: SoundPoint): void {
  playSound(sound, at);
  if (heard !== null) sendCue({ sound, environment: heard, ...at });
}

/** Plays another player's sound where they made it, when it happened in the environment shown. */
export function hearCue(cue: SoundCue): void {
  if (cue.environment === heard) playSound(cue.sound, { x: cue.x, y: cue.y, z: cue.z });
}
