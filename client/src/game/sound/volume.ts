const VOLUME_KEY = 'tbn_sound_volume';

/** The volume a browser starts at before anyone moves the slider. */
export const DEFAULT_VOLUME = 0.6;

/** The volume this browser last set, from 0 (silent) to 1; the default when none is kept. */
export function loadVolume(): number {
  try {
    const kept = window.localStorage.getItem(VOLUME_KEY);
    const value = kept === null ? Number.NaN : Number(kept);
    return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : DEFAULT_VOLUME;
  } catch {
    return DEFAULT_VOLUME;
  }
}

/** Keeps the volume in this browser. */
export function saveVolume(volume: number): void {
  try {
    window.localStorage.setItem(VOLUME_KEY, String(volume));
  } catch {
    // A browser that blocks storage starts at the default volume every time.
  }
}
