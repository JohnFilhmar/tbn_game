import { useEffect } from 'react';
import { playTune } from './radioTune';

/** Props of `RadioPlayer`. */
export interface RadioPlayerProps {
  /** True while a radio in the environment shown is on. */
  isOn: boolean;
}

const VOLUME = 0.15;

/**
 * The radio's calm loop, playing while a radio is on. A browser starts sound only after a press
 * on the page, so after a reload with the radio on the loop starts on the next key or click.
 */
export function RadioPlayer({ isOn }: RadioPlayerProps) {
  useEffect(() => {
    if (!isOn || typeof AudioContext === 'undefined') return undefined;
    const context = new AudioContext();
    const stop = playTune(context, VOLUME);
    const wake = (): void => {
      if (context.state === 'suspended') void context.resume();
    };
    wake();
    window.addEventListener('pointerdown', wake);
    window.addEventListener('keydown', wake);
    return () => {
      window.removeEventListener('pointerdown', wake);
      window.removeEventListener('keydown', wake);
      stop();
      void context.close();
    };
  }, [isOn]);
  return null;
}
