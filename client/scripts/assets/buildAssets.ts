import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Mesh, MeshStandardMaterial, type Object3D } from 'three';
import {
  BODY_VARIANTS,
  CLIP_NAMES,
  PALETTE_DEFAULTS,
  buildCharacter,
  buildParts,
} from './characters.ts';
import { writeGlb, writeJson } from './export.ts';
import { buildHome } from './packs/home.ts';
import { buildOffice } from './packs/office.ts';
import { buildWarehouse } from './packs/warehouse.ts';

/**
 * Writes every asset the world loads: the character set into `src/game/characters` and the three
 * environment packs into `src/game/packs`. Run from the client workspace with
 * `npm run build:assets`. The files are committed; this script is how they are remade.
 */

const here = dirname(fileURLToPath(import.meta.url));
const gameDir = join(here, '..', '..', 'src', 'game');

function isMesh(object: Object3D): object is Mesh {
  return object instanceof Mesh;
}

function triangles(root: Object3D): number {
  let count = 0;
  root.traverse((object) => {
    if (isMesh(object)) {
      const geometry = object.geometry;
      count += (geometry.index?.count ?? geometry.getAttribute('position').count) / 3;
    }
  });
  return count;
}

async function writeCharacters(): Promise<void> {
  const dir = join(gameDir, 'characters');
  const bodies: Record<string, { file: string; width: number; height: number }> = {};
  for (const variant of BODY_VARIANTS) {
    const { root, clips } = buildCharacter(variant);
    const file = `body_${variant.name}.glb`;
    const bytes = await writeGlb(join(dir, file), root, clips);
    bodies[variant.name] = { file, width: variant.width, height: variant.height };
    console.log(`characters/${file}: ${triangles(root)} triangles, ${bytes} bytes`);
  }
  const parts: Record<string, Record<string, string>> = {};
  for (const part of buildParts()) {
    const file = `${part.kind}_${part.name}.glb`;
    await writeGlb(join(dir, file), part.root);
    parts[part.kind] = { ...parts[part.kind], [part.name]: file };
  }
  await writeJson(join(dir, 'manifest.json'), {
    version: 1,
    scale: 1,
    bodies,
    clips: CLIP_NAMES,
    attach: { hair: 'head', outfit: 'spine', accessory: 'head' },
    parts,
    palette: PALETTE_DEFAULTS,
  });
}

async function writePacks(): Promise<void> {
  for (const build of [buildOffice, buildHome, buildWarehouse]) {
    const pack = build();
    const dir = join(gameDir, 'packs', pack.manifest.name);
    const sceneBytes = await writeGlb(join(dir, 'scene.glb'), pack.scene);
    const navmesh = new Mesh(pack.navmesh, new MeshStandardMaterial({ name: 'navmesh' }));
    navmesh.name = 'navmesh';
    const navmeshBytes = await writeGlb(join(dir, 'navmesh.glb'), navmesh);
    await writeJson(join(dir, 'manifest.json'), {
      ...pack.manifest,
      scene: 'scene.glb',
      navmesh: 'navmesh.glb',
    });
    console.log(
      `packs/${pack.manifest.name}: scene ${triangles(pack.scene)} triangles in ${pack.scene.children.length} meshes, ${sceneBytes} bytes; navmesh ${triangles(navmesh)} triangles, ${navmeshBytes} bytes`,
    );
  }
}

await writeCharacters();
await writePacks();
