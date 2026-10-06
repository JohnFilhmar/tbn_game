import { useEffect, useRef } from 'react';
import { Vector3 } from 'three';
import { liveView, playerPositions } from '@/game/world/livePositions';
import { usePlayersStore } from '@/lib/stores/playersStore';

/** How high above a player's feet their name floats, in metres. */
const ABOVE = 2.15;

/**
 * Each other player's name over their head, and "offline" for one who left, following them on
 * screen every animation frame. Drawn as DOM over the canvas, never part of the scene.
 */
export function PlayerNames() {
  const players = usePlayersStore((state) => state.players);
  const labels = useRef(new Map<string, HTMLSpanElement>());

  useEffect(() => {
    const point = new Vector3();
    let frame = 0;
    const follow = (): void => {
      frame = window.requestAnimationFrame(follow);
      const camera = liveView.camera;
      for (const [id, label] of labels.current) {
        const at = playerPositions.get(id);
        if (camera === null || at === undefined) {
          label.style.visibility = 'hidden';
          continue;
        }
        point.set(at.x, ABOVE, at.z).project(camera);
        const isInView = point.z < 1 && Math.abs(point.x) < 1.1 && Math.abs(point.y) < 1.1;
        label.style.visibility = isInView ? 'visible' : 'hidden';
        const x = ((point.x + 1) / 2) * window.innerWidth;
        const y = ((1 - point.y) / 2) * window.innerHeight;
        label.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
      }
    };
    follow();
    return () => window.cancelAnimationFrame(frame);
  }, []);

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-20">
      {Object.values(players).map((player) => (
        <span
          key={player.id}
          ref={(element) => {
            if (element === null) labels.current.delete(player.id);
            else labels.current.set(player.id, element);
          }}
          className="invisible absolute top-0 left-0 rounded-md bg-slate-950/70 px-2 py-0.5 text-xs font-semibold whitespace-nowrap text-slate-100"
        >
          {player.name}
          {!player.online && <span className="ml-1 font-normal text-slate-400">offline</span>}
        </span>
      ))}
    </div>
  );
}
