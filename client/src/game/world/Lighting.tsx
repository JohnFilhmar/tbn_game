import { useMemo } from 'react';
import { forwardOf, radiansOf } from '@/game/assets/geometry';
import type { Bounds, PackManifest } from '@/game/assets/packManifest';
import { lightingAt } from './timeOfDay';

/** Props of `Lighting`. */
export interface LightingProps {
  hour: number;
  profile: PackManifest['lighting'];
  bounds: Bounds;
}

const KEY_DISTANCE = 40;

/**
 * The sky, the sun or moon, the ambient light and the interior lights, from the hour and the
 * pack's profile. The key light casts the one shadow map, sized to the pack's floor.
 */
export function Lighting({ hour, profile, bounds }: LightingProps) {
  const light = useMemo(() => lightingAt(hour), [hour]);
  const [dx, dz] = forwardOf(profile.sun_azimuth_deg + light.keyAzimuthOffsetDeg);
  const elevation = radiansOf(light.keyElevationDeg);
  const keyPosition: [number, number, number] = [
    dx * Math.cos(elevation) * KEY_DISTANCE,
    Math.sin(elevation) * KEY_DISTANCE,
    dz * Math.cos(elevation) * KEY_DISTANCE,
  ];
  const width = bounds.max_x - bounds.min_x;
  const depth = bounds.max_z - bounds.min_z;
  const half = Math.max(width, depth) / 2 + 4;
  const diagonal = Math.hypot(width, depth);
  return (
    <>
      <color attach="background" args={[light.skyColor]} />
      <fog attach="fog" args={[light.horizonColor, diagonal * 1.5, diagonal * 4]} />
      <hemisphereLight args={[light.skyColor, light.groundColor, 0.6]} />
      <ambientLight color={profile.ambient} intensity={light.ambientIntensity} />
      <directionalLight
        position={keyPosition}
        color={light.keyColor}
        intensity={light.keyIntensity}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-half}
        shadow-camera-right={half}
        shadow-camera-top={half}
        shadow-camera-bottom={-half}
        shadow-camera-near={1}
        shadow-camera-far={KEY_DISTANCE * 2.5}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
      />
      {light.interiorOn &&
        profile.interior.map((interior, index) => (
          <pointLight
            key={index}
            position={interior.position}
            color={interior.color}
            intensity={interior.intensity}
            distance={interior.distance}
            decay={2}
          />
        ))}
    </>
  );
}
