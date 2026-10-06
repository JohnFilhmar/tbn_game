import type { SoundCueName } from '@tbn/contracts';

/** Every sound the world makes: the props' sounds, footsteps, and the chat's send and chime. */
export type SoundName = SoundCueName | 'step' | 'run_step' | 'send' | 'receive';

/** What a recipe plays with: the context and a second of white noise to filter. */
export interface SoundKit {
  context: AudioContext;
  noise: AudioBuffer;
}

type Recipe = (kit: SoundKit, out: AudioNode, at: number) => void;

/** A gain that rises to `level` over `attack` seconds and dies away by `seconds`. */
function envelope(kit: SoundKit, out: AudioNode, at: number, seconds: number, level: number) {
  const gain = kit.context.createGain();
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.linearRampToValueAtTime(level, at + Math.min(0.02, seconds / 4));
  gain.gain.exponentialRampToValueAtTime(0.0001, at + seconds);
  gain.connect(out);
  return gain;
}

/** One tone of `seconds`, gliding from `from` to `to` hertz. */
function tone(
  kit: SoundKit,
  out: AudioNode,
  at: number,
  shape: { type: OscillatorType; from: number; to?: number; seconds: number; level: number },
): void {
  const oscillator = kit.context.createOscillator();
  oscillator.type = shape.type;
  oscillator.frequency.setValueAtTime(shape.from, at);
  if (shape.to !== undefined) {
    oscillator.frequency.exponentialRampToValueAtTime(shape.to, at + shape.seconds);
  }
  oscillator.connect(envelope(kit, out, at, shape.seconds, shape.level));
  oscillator.start(at);
  oscillator.stop(at + shape.seconds + 0.05);
}

/** A burst of filtered noise of `seconds`, its filter gliding from `from` to `to` hertz. */
function noise(
  kit: SoundKit,
  out: AudioNode,
  at: number,
  shape: {
    filter: BiquadFilterType;
    from: number;
    to?: number;
    q?: number;
    seconds: number;
    level: number;
  },
): void {
  const source = kit.context.createBufferSource();
  source.buffer = kit.noise;
  source.loop = true;
  const filter = kit.context.createBiquadFilter();
  filter.type = shape.filter;
  filter.Q.value = shape.q ?? 1;
  filter.frequency.setValueAtTime(shape.from, at);
  if (shape.to !== undefined)
    filter.frequency.linearRampToValueAtTime(shape.to, at + shape.seconds);
  source.connect(filter).connect(envelope(kit, out, at, shape.seconds, shape.level));
  source.start(at, Math.random() * 0.5);
  source.stop(at + shape.seconds + 0.05);
}

/** A soft footfall, a little different every time. */
function step(level: number): Recipe {
  return (kit, out, at) => {
    const pitch = 0.85 + Math.random() * 0.3;
    noise(kit, out, at, { filter: 'lowpass', from: 650 * pitch, seconds: 0.08, level });
    tone(kit, out, at, { type: 'sine', from: 95 * pitch, to: 60, seconds: 0.06, level: level / 2 });
  };
}

/**
 * Each sound as one to three tones or bursts of noise: pouring rises as the cup fills, the cooler
 * glugs, a watering sprinkles, grass rustles, a seat thumps, a switch clicks, blinds rattle and a
 * marker squeaks. Levels are set against each other; the master volume scales them all.
 */
export const SOUNDS: Record<SoundName, Recipe> = {
  step: step(0.22),
  run_step: step(0.32),
  pour: (kit, out, at) => {
    noise(kit, out, at, {
      filter: 'bandpass',
      from: 700,
      to: 1700,
      q: 3,
      seconds: 1.8,
      level: 0.5,
    });
  },
  bubble: (kit, out, at) => {
    for (const delay of [0, 0.35, 0.75]) {
      tone(kit, out, at + delay, { type: 'sine', from: 180, to: 420, seconds: 0.16, level: 0.35 });
    }
  },
  sprinkle: (kit, out, at) => {
    noise(kit, out, at, { filter: 'highpass', from: 2600, seconds: 1.4, level: 0.18 });
    for (const delay of [0.3, 0.7, 1.1]) {
      tone(kit, out, at + delay, {
        type: 'sine',
        from: 1700,
        to: 2600,
        seconds: 0.05,
        level: 0.08,
      });
    }
  },
  rustle: (kit, out, at) => {
    for (const delay of [0, 0.18, 0.4]) {
      noise(kit, out, at + delay, {
        filter: 'bandpass',
        from: 3200,
        q: 0.8,
        seconds: 0.2,
        level: 0.2,
      });
    }
  },
  sit: (kit, out, at) => {
    tone(kit, out, at, { type: 'sine', from: 140, to: 55, seconds: 0.2, level: 0.5 });
    noise(kit, out, at, { filter: 'lowpass', from: 420, seconds: 0.3, level: 0.25 });
  },
  click: (kit, out, at) => {
    tone(kit, out, at, { type: 'square', from: 1900, seconds: 0.02, level: 0.12 });
    tone(kit, out, at + 0.07, { type: 'square', from: 1300, seconds: 0.02, level: 0.1 });
  },
  blinds: (kit, out, at) => {
    for (let tick = 0; tick < 8; tick += 1) {
      noise(kit, out, at + tick * 0.055, {
        filter: 'bandpass',
        from: 2000 + (tick % 3) * 300,
        q: 6,
        seconds: 0.04,
        level: 0.35,
      });
    }
  },
  scribble: (kit, out, at) => {
    for (const delay of [0, 0.32]) {
      noise(kit, out, at + delay, {
        filter: 'bandpass',
        from: 1800,
        to: 2600,
        q: 9,
        seconds: 0.25,
        level: 0.3,
      });
    }
  },
  send: (kit, out, at) => {
    tone(kit, out, at, { type: 'triangle', from: 660, seconds: 0.09, level: 0.18 });
    tone(kit, out, at + 0.09, { type: 'triangle', from: 990, seconds: 0.14, level: 0.18 });
  },
  receive: (kit, out, at) => {
    tone(kit, out, at, { type: 'sine', from: 880, seconds: 0.3, level: 0.22 });
    tone(kit, out, at + 0.13, { type: 'sine', from: 1320, seconds: 0.45, level: 0.2 });
  },
};
