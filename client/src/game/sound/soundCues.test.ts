import { afterEach, describe, expect, it, vi } from 'vitest';
import { setPresenceSender } from '@/lib/realtime/presenceChannel';
import { cueSound, hearCue, setHeardEnvironment } from './soundCues';
import { playSound } from './soundEngine';

vi.mock('./soundEngine', () => ({ playSound: vi.fn() }));

describe('sound cues', () => {
  afterEach(() => {
    vi.mocked(playSound).mockClear();
    setPresenceSender(null);
    setHeardEnvironment(null);
  });

  it('plays your sound here and sends it to the others with the environment', () => {
    const sendCue = vi.fn();
    setPresenceSender({ sendPresence: vi.fn(), sendCue });
    setHeardEnvironment('office');
    cueSound('blinds', { x: 1, y: 1, z: 2 });
    expect(playSound).toHaveBeenCalledWith('blinds', { x: 1, y: 1, z: 2 });
    expect(sendCue).toHaveBeenCalledWith({
      sound: 'blinds',
      environment: 'office',
      x: 1,
      y: 1,
      z: 2,
    });
  });

  it("plays another player's sound where they made it, only in the environment shown", () => {
    setHeardEnvironment('office');
    hearCue({ sound: 'sit', environment: 'home', x: 0, y: 0, z: 0 });
    expect(playSound).not.toHaveBeenCalled();
    hearCue({ sound: 'sit', environment: 'office', x: 3, y: 0.5, z: -1 });
    expect(playSound).toHaveBeenCalledWith('sit', { x: 3, y: 0.5, z: -1 });
  });
});
