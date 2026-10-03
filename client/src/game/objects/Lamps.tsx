import { useFrame } from '@react-three/fiber';
import type { WorldPlacement } from '@tbn/contracts';
import { useMemo, useRef } from 'react';
import { BoxGeometry, MeshStandardMaterial, type PointLight } from 'three';
import { lampVariant, type LampVariant } from '@/game/props/fixtures';
import { variantOf } from '@/game/props/propModel';
import { isLampLit, MOST_LIT_LAMPS, nearestLit, type LampSpot } from './lighting';
import { stateOf, type PropStates } from './propStates';

/** Props of `Lamps`. */
export interface LampsProps {
  /** The lamp placements of the layout. */
  lamps: readonly WorldPlacement[];
  states: PropStates;
  /** True from dusk: lamps on auto shine. */
  isInteriorOn: boolean;
  /** Called with a lamp's id when it is clicked; build mode selects it. */
  onPick?: (placementId: string) => void;
}

interface Lamp extends LampSpot {
  variant: LampVariant;
}

const SHADE = new BoxGeometry(0.7, 0.05, 0.7);
const LIT = new MeshStandardMaterial({
  name: 'light',
  color: '#fff6dc',
  emissive: '#fff1cc',
  emissiveIntensity: 1.2,
});
const UNLIT = new MeshStandardMaterial({ name: 'light', color: '#e4dfd2', roughness: 0.9 });
/** How often the pool picks its lamps again as the camera moves, in seconds. */
const PICK_EVERY = 0.25;

/**
 * Every lamp's shade, glowing when it shines, and a fixed pool of eight point lights given to the
 * lit lamps nearest the camera. The pool never changes size, so switching a lamp never recompiles
 * a shader.
 */
export function Lamps({ lamps, states, isInteriorOn, onPick }: LampsProps) {
  const spots = useMemo(
    (): Lamp[] =>
      lamps.map((placement) => {
        const variant = lampVariant(variantOf(placement));
        return {
          id: placement.id,
          x: placement.x,
          y: variant.height - 0.2,
          z: placement.z,
          isLit: isLampLit(stateOf.lampMode(states, placement.id), isInteriorOn),
          variant,
        };
      }),
    [lamps, states, isInteriorOn],
  );
  const lights = useRef<(PointLight | null)[]>([]);
  const picked = useRef({ at: -Infinity, spots });

  useFrame(({ camera, clock }) => {
    const now = clock.elapsedTime;
    const own = picked.current;
    if (own.spots === spots && now - own.at < PICK_EVERY) return;
    own.at = now;
    own.spots = spots;
    const chosen = nearestLit(spots, camera.position);
    lights.current.forEach((light, index) => {
      if (light === null) return;
      const lamp = chosen[index];
      if (lamp === undefined) {
        light.intensity = 0;
        return;
      }
      light.position.set(lamp.x, lamp.y, lamp.z);
      light.color.set(lamp.variant.color);
      light.intensity = lamp.variant.intensity;
      light.distance = lamp.variant.distance;
    });
  });

  return (
    <>
      {spots.map((lamp) => (
        <mesh
          key={lamp.id}
          geometry={SHADE}
          material={lamp.isLit ? LIT : UNLIT}
          position={[lamp.x, lamp.variant.height, lamp.z]}
          onClick={(event) => {
            if (onPick === undefined) return;
            event.stopPropagation();
            onPick(lamp.id);
          }}
        />
      ))}
      {Array.from({ length: MOST_LIT_LAMPS }, (_, index) => (
        <pointLight
          key={index}
          ref={(light) => {
            lights.current[index] = light;
          }}
          intensity={0}
          decay={2}
        />
      ))}
    </>
  );
}
