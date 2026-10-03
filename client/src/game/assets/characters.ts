import {
  CharacterManifestSchema,
  type CharacterManifest,
  type PartKind,
} from './characterManifest';

/** The character set ready to load: its manifest and the address of each file. */
export interface CharacterSet {
  manifest: CharacterManifest;
  /** The address of a file the manifest names. */
  urlOf: (file: string) => string;
}

const manifests = import.meta.glob<unknown>('../characters/manifest.json', {
  eager: true,
  import: 'default',
});
const files = import.meta.glob<string>('../characters/*.glb', {
  eager: true,
  query: '?url',
  import: 'default',
});

function loadCharacterSet(): CharacterSet {
  const json = Object.values(manifests)[0];
  const manifest = CharacterManifestSchema.parse(json);
  return {
    manifest,
    urlOf: (file) => {
      const url = files[`../characters/${file}`];
      if (url === undefined) throw new Error(`Character file ${file} is not shipped`);
      return url;
    },
  };
}

/** The one character set, which dresses the owner and every agent. */
export const CHARACTER_SET: CharacterSet = loadCharacterSet();

/** The body variants the set offers, the default first. */
export function bodyNames(set: CharacterSet): string[] {
  return ['regular', ...Object.keys(set.manifest.bodies).filter((name) => name !== 'regular')];
}

/** The names of the parts of one kind. */
export function partNames(set: CharacterSet, kind: PartKind): string[] {
  return Object.keys(set.manifest.parts[kind]);
}
