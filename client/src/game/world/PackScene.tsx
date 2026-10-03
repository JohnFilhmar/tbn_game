import { useLoader } from '@react-three/fiber';
import type { WorldTheme } from '@tbn/contracts';
import { useEffect } from 'react';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { LoadedPack } from '@/game/assets/packs';
import { themeColor } from '@/game/props/themes';
import { isStandardMaterial, materialsOf, meshesOf } from './sceneObjects';

/** Props of `PackScene`. */
export interface PackSceneProps {
  pack: LoadedPack;
  /** True from dusk: the lamps glow. */
  isLit: boolean;
  theme: WorldTheme;
}

/**
 * The fixed shell of a pack: its floors, walls, doors, windows and lamps, with shadows on
 * everything but the lamps, in the theme's colours. Each material remembers the colour the pack
 * made it with, so a slot the theme leaves out goes back to it.
 */
export function PackScene({ pack, isLit, theme }: PackSceneProps) {
  const scene = useLoader(GLTFLoader, pack.sceneUrl);
  const { scale } = pack.manifest;

  useEffect(() => {
    for (const mesh of meshesOf(scene.scene)) {
      const materials = materialsOf(mesh);
      const isLamp = materials.some((material) => material.name === 'light');
      mesh.castShadow = !isLamp;
      mesh.receiveShadow = !isLamp;
      for (const material of materials) {
        if (!isStandardMaterial(material)) continue;
        const base: unknown = material.userData['packColor'];
        const packColor = typeof base === 'string' ? base : `#${material.color.getHexString()}`;
        material.userData['packColor'] = packColor;
        material.color.set(themeColor(theme, material.name, packColor));
        if (material.name === 'glass') {
          material.transparent = true;
          material.opacity = 0.4;
        }
        if (material.name === 'light') {
          material.emissive.set('#fff1cc');
          material.emissiveIntensity = isLit ? 1.2 : 0;
        }
      }
    }
  }, [scene, isLit, theme]);

  return <primitive object={scene.scene} scale={scale} />;
}
