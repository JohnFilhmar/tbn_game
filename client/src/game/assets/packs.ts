import type { EnvironmentName } from '@tbn/contracts';
import { PackManifestSchema, type PackManifest } from './packManifest';

/** A pack ready to load: its manifest and the addresses of its files, as Vite serves them. */
export interface LoadedPack {
  manifest: PackManifest;
  sceneUrl: string;
  navmeshUrl: string;
}

const manifests = import.meta.glob<unknown>('../packs/*/manifest.json', {
  eager: true,
  import: 'default',
});
const files = import.meta.glob<string>('../packs/*/*.glb', {
  eager: true,
  query: '?url',
  import: 'default',
});

function fileUrl(directory: string, file: string): string {
  const url = files[`${directory}/${file}`];
  if (url === undefined) throw new Error(`Pack file ${directory}/${file} is not shipped`);
  return url;
}

function loadPacks(): Record<EnvironmentName, LoadedPack> {
  const packs: Partial<Record<EnvironmentName, LoadedPack>> = {};
  for (const [path, json] of Object.entries(manifests)) {
    const manifest = PackManifestSchema.parse(json);
    const directory = path.slice(0, path.lastIndexOf('/'));
    packs[manifest.name] = {
      manifest,
      sceneUrl: fileUrl(directory, manifest.scene),
      navmeshUrl: fileUrl(directory, manifest.navmesh),
    };
  }
  const { office, home, warehouse } = packs;
  if (office === undefined || home === undefined || warehouse === undefined) {
    throw new Error('The office, home and warehouse packs must all ship');
  }
  return { office, home, warehouse };
}

/** Every environment pack, by name. Reading a manifest that does not parse fails the build. */
export const PACKS: Record<EnvironmentName, LoadedPack> = loadPacks();
