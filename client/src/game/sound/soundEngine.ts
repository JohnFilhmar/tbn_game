import { placedPanner, type SoundPoint } from './listener';
import { SOUNDS, type SoundKit, type SoundName } from './recipes';
import { loadVolume, saveVolume } from './volume';

/** The page's one audio graph: every sound goes through the master gain. */
interface Engine extends SoundKit {
  master: GainNode;
}

/** How long a placed one-shot keeps its panner; the longest recipe is under two seconds. */
const ONE_SHOT_MS = 2_500;

// ponytail: one module-level engine, as a page has one world and one pair of ears.
let engine: Engine | null = null;
let volume = loadVolume();
const waiting = new Set<(ready: Engine) => void>();

function start(): Engine {
  const context = new AudioContext();
  const master = context.createGain();
  master.gain.value = volume;
  master.connect(context.destination);
  const noise = context.createBuffer(1, context.sampleRate, context.sampleRate);
  const samples = noise.getChannelData(0);
  for (let index = 0; index < samples.length; index += 1) samples[index] = Math.random() * 2 - 1;
  return { context, master, noise };
}

/**
 * Readies sound for the page. A browser lets a page make sound only after a key or a click on it,
 * so the audio graph starts on the first of them, and resumes on any later one if the browser
 * suspended it. Answers a function that stops listening for them.
 */
export function armSound(): () => void {
  const wake = (): void => {
    if (typeof AudioContext === 'undefined') return;
    if (engine === null) {
      const ready = start();
      engine = ready;
      for (const run of waiting) run(ready);
      waiting.clear();
    }
    if (engine.context.state === 'suspended') void engine.context.resume();
  };
  window.addEventListener('pointerdown', wake);
  window.addEventListener('keydown', wake);
  return () => {
    window.removeEventListener('pointerdown', wake);
    window.removeEventListener('keydown', wake);
  };
}

/**
 * Plays `name` once: placed at `at` in the world, fading with distance and panned to its side,
 * or without `at` straight to both ears, as the chat's sounds. Silent until sound is armed.
 */
export function playSound(name: SoundName, at?: SoundPoint): void {
  if (engine === null || volume === 0) return;
  const kit = engine;
  let out: AudioNode = kit.master;
  if (at !== undefined) {
    const { panner, release } = placedPanner(kit.context, at);
    panner.connect(kit.master);
    window.setTimeout(release, ONE_SHOT_MS);
    out = panner;
  }
  SOUNDS[name](kit, out, kit.context.currentTime + 0.01);
}

/**
 * Runs `begin` with the audio graph's context and master gain once sound is armed, at once when
 * it already is; `begin` answers how to stop what it started. Answers a function that stops it,
 * or forgets `begin` if sound was never armed.
 */
export function whenSoundReady(
  begin: (context: AudioContext, master: AudioNode) => () => void,
): () => void {
  let stop: (() => void) | null = null;
  const run = (ready: Engine): void => {
    stop = begin(ready.context, ready.master);
  };
  if (engine === null) waiting.add(run);
  else run(engine);
  return () => {
    waiting.delete(run);
    stop?.();
  };
}

/** The volume every sound plays at, from 0 to 1, as the slider shows it. */
export const soundVolume = {
  get: (): number => volume,
  set: (next: number): void => {
    volume = Math.min(1, Math.max(0, next));
    saveVolume(volume);
    if (engine !== null) engine.master.gain.value = volume;
  },
};
