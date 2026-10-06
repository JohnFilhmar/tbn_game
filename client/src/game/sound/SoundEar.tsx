import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import { Vector3 } from 'three';
import { localPose } from '@/game/world/livePositions';
import { setEar } from './listener';
import { armSound } from './soundEngine';

/**
 * Your ears in the world: sound is armed for the page while the world is up, and every frame the
 * ear stands on your character and faces the way the camera looks.
 */
export function SoundEar() {
  const facing = useMemo(() => new Vector3(), []);
  useEffect(() => armSound(), []);
  useFrame(({ camera }) => {
    if (!localPose.isPlaced) return;
    camera.getWorldDirection(facing);
    setEar(localPose.x, localPose.z, facing.x, facing.z);
  });
  return null;
}
