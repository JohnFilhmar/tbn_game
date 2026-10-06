import type { WorldPlacement } from '@tbn/contracts';
import { useEffect } from 'react';
import { placedPanner } from '@/game/sound/listener';
import { whenSoundReady } from '@/game/sound/soundEngine';
import { playTune } from './radioTune';

/** Props of `RadioPlayer`. */
export interface RadioPlayerProps {
  /** The radio playing in the environment shown, or null while none is on. */
  radio: WorldPlacement | null;
}

const VOLUME = 0.35;

/**
 * The radio's calm loop, playing from the radio while it is on: louder close by, faint across the
 * room. The world's sound starts on the first key or click on the page, so after a reload with
 * the radio on the loop starts then.
 */
export function RadioPlayer({ radio }: RadioPlayerProps) {
  useEffect(() => {
    if (radio === null) return undefined;
    return whenSoundReady((context, master) => {
      const { panner, release } = placedPanner(context, { x: radio.x, y: 1, z: radio.z });
      panner.connect(master);
      const stop = playTune(context, panner, VOLUME);
      return () => {
        stop();
        release();
      };
    });
  }, [radio]);
  return null;
}
