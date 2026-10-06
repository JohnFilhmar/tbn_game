import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_VOLUME, loadVolume, saveVolume } from './volume';

describe('the remembered volume', () => {
  afterEach(() => window.localStorage.clear());

  it('starts at the default, then keeps what was set', () => {
    expect(loadVolume()).toBe(DEFAULT_VOLUME);
    saveVolume(0);
    expect(loadVolume()).toBe(0);
    saveVolume(0.35);
    expect(loadVolume()).toBe(0.35);
  });

  it('falls back on a value that is not a volume and clamps one out of range', () => {
    window.localStorage.setItem('tbn_sound_volume', 'loud');
    expect(loadVolume()).toBe(DEFAULT_VOLUME);
    window.localStorage.setItem('tbn_sound_volume', '7');
    expect(loadVolume()).toBe(1);
  });
});
