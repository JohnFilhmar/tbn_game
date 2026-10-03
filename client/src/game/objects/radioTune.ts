/** How long one bar of the tune lasts, in seconds. */
export const BAR_SECONDS = 4;

/** Four soft chords, as MIDI notes: C major 7, A minor 7, F major 7 and G 7. */
const CHORDS: readonly (readonly number[])[] = [
  [48, 55, 59, 64],
  [45, 52, 55, 60],
  [41, 48, 52, 57],
  [43, 50, 53, 59],
];

/** C major pentatonic over two octaves, which sits well over every chord. */
const MELODY_NOTES = [72, 74, 76, 79, 81, 84, 86, 88];

/** A bar's notes: its chord, and four melody notes or rests (null), one on each beat. */
export interface Bar {
  chord: readonly number[];
  melody: (number | null)[];
}

/**
 * The notes of bar `index`. The chords turn every bar and the melody wanders by small steps,
 * the same for the same bar, so the loop never needs a file.
 */
export function barNotes(index: number): Bar {
  const chord = CHORDS[index % CHORDS.length] ?? CHORDS[0] ?? [];
  const melody = [0, 1, 2, 3].map((beat) => {
    const seed = (index * 7 + beat * 3) % 11;
    if (seed % 4 === 3) return null;
    return MELODY_NOTES[(index + beat * 2 + seed) % MELODY_NOTES.length] ?? null;
  });
  return { chord, melody };
}

function frequencyOf(note: number): number {
  return 440 * 2 ** ((note - 69) / 12);
}

function tone(
  context: AudioContext,
  out: AudioNode,
  note: number,
  at: number,
  seconds: number,
  level: number,
): void {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = 'sine';
  oscillator.frequency.value = frequencyOf(note);
  gain.gain.setValueAtTime(0, at);
  gain.gain.linearRampToValueAtTime(level, at + Math.min(0.8, seconds / 3));
  gain.gain.linearRampToValueAtTime(0, at + seconds);
  oscillator.connect(gain).connect(out);
  oscillator.start(at);
  oscillator.stop(at + seconds + 0.05);
}

/**
 * Plays the calm loop on `context` at `volume`, scheduling a bar ahead of time, and answers a
 * function that stops it.
 */
export function playTune(context: AudioContext, volume: number): () => void {
  const out = context.createGain();
  out.gain.value = volume;
  out.connect(context.destination);
  let bar = 0;
  let nextAt = context.currentTime + 0.1;
  const schedule = (): void => {
    while (nextAt < context.currentTime + BAR_SECONDS) {
      const { chord, melody } = barNotes(bar);
      for (const note of chord) tone(context, out, note, nextAt, BAR_SECONDS, 0.12);
      melody.forEach((note, beat) => {
        if (note !== null) tone(context, out, note, nextAt + beat, 0.9, 0.08);
      });
      bar += 1;
      nextAt += BAR_SECONDS;
    }
  };
  schedule();
  const timer = window.setInterval(schedule, 1_000);
  return () => {
    window.clearInterval(timer);
    out.disconnect();
  };
}
