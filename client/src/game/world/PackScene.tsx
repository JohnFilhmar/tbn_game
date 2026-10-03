import { useLoader } from '@react-three/fiber';
import { useEffect } from 'react';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { LoadedPack } from '@/game/assets/packs';
import { Navigation } from './navmesh';
import { isMesh, isStandardMaterial, materialsOf, meshesOf } from './sceneObjects';

/** Props of `PackScene`. */
export interface PackSceneProps {
  pack: LoadedPack;
  /** True from dusk: the lamps glow. */
  isLit: boolean;
  /** Called once the navigation mesh is built, with the navigation over it. */
  onNavigation: (navigation: Navigation) => void;
}

/** The static scene of a pack, with shadows on everything but the lamps, and its navigation mesh. */
export function PackScene({ pack, isLit, onNavigation }: PackSceneProps) {
  const scene = useLoader(GLTFLoader, pack.sceneUrl);
  const navmesh = useLoader(GLTFLoader, pack.navmeshUrl);
  const { scale, name } = pack.manifest;

  useEffect(() => {
    const mesh = navmesh.scene.getObjectByName('navmesh');
    if (mesh === undefined || !isMesh(mesh)) {
      throw new Error(`The ${name} pack has no mesh named navmesh`);
    }
    const geometry = scale === 1 ? mesh.geometry : mesh.geometry.clone().scale(scale, scale, scale);
    onNavigation(new Navigation(geometry));
  }, [navmesh, onNavigation, name, scale]);

  useEffect(() => {
    for (const mesh of meshesOf(scene.scene)) {
      const materials = materialsOf(mesh);
      const isLamp = materials.some((material) => material.name === 'light');
      mesh.castShadow = !isLamp;
      mesh.receiveShadow = !isLamp;
      for (const material of materials) {
        if (!isStandardMaterial(material)) continue;
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
  }, [scene, isLit]);

  return <primitive object={scene.scene} scale={scale} />;
}
