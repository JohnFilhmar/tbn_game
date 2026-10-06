import { useState } from 'react';
import { soundVolume } from '@/game/sound/soundEngine';

/** The volume of every sound in the world, the radio included, kept in this browser. */
export function SoundVolume() {
  const [volume, setVolume] = useState(() => soundVolume.get());
  return (
    <label className="flex items-center gap-2 px-2 text-sm">
      Sound
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={volume}
        aria-valuetext={volume === 0 ? 'off' : `${Math.round(volume * 100)}%`}
        className="w-24 accent-teal-400"
        onChange={(event) => {
          const next = Number(event.target.value);
          setVolume(next);
          soundVolume.set(next);
        }}
      />
    </label>
  );
}
