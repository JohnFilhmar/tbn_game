import type { Appearance } from '@tbn/contracts';
import {
  PaletteSlotSchema,
  PartKindSchema,
  type PaletteSlot,
  type PartKind,
} from './characterManifest';
import type { CharacterSet } from './characters';

/** A part to attach: which node of the body it goes under, and where its file is. */
export interface ResolvedPart {
  kind: PartKind;
  name: string;
  url: string;
  attach: 'head' | 'spine';
}

/** An appearance turned into files and colours, so a character can be built from it. */
export interface ResolvedAppearance {
  body: { name: string; url: string; width: number; height: number };
  parts: ResolvedPart[];
  colors: Record<PaletteSlot, string>;
  /** Changes whenever anything above does; a character rebuilds when it changes. */
  key: string;
}

/**
 * Resolves an appearance against the character set. A part or body the set does not have is
 * ignored, so an old appearance survives a set that dropped a part; a colour of an unknown slot is
 * ignored the same way.
 */
export function resolveAppearance(set: CharacterSet, appearance: Appearance): ResolvedAppearance {
  const { manifest } = set;
  const bodyName =
    appearance.body !== undefined && appearance.body in manifest.bodies
      ? appearance.body
      : 'regular';
  const body = manifest.bodies[bodyName];
  if (body === undefined) throw new Error('The character set has no regular body');
  const parts: ResolvedPart[] = [];
  for (const kind of PartKindSchema.options) {
    const name = appearance[kind];
    if (name === undefined) continue;
    const file = manifest.parts[kind][name];
    if (file === undefined) continue;
    parts.push({ kind, name, url: set.urlOf(file), attach: manifest.attach[kind] });
  }
  const colors: Record<PaletteSlot, string> = { ...manifest.palette };
  for (const [slot, color] of Object.entries(appearance.colors ?? {})) {
    const parsed = PaletteSlotSchema.safeParse(slot);
    if (parsed.success) colors[parsed.data] = color;
  }
  const key = [
    bodyName,
    ...parts.map((part) => `${part.kind}=${part.name}`),
    ...Object.entries(colors).map(([slot, color]) => `${slot}=${color}`),
  ].join(';');
  return {
    body: { name: bodyName, url: set.urlOf(body.file), width: body.width, height: body.height },
    parts,
    colors,
    key,
  };
}

const SKINS = ['#f1c9a5', '#e8b89a', '#d9a077', '#c68642', '#8d5524', '#5c3a21'];
const HAIRS = ['#1b1b1f', '#4a2e1a', '#8b5a2b', '#c9a24a', '#b0b0b0', '#aa3344'];
const TOPS = ['#3b6fb6', '#2a9d8f', '#e76f51', '#8e44ad', '#f4a261', '#1f7a4d'];
const BOTTOMS = ['#374151', '#264653', '#5b4636', '#1f2937', '#3f3f46'];
const ACCENTS = ['#f59e0b', '#e9c46a', '#06b6d4', '#ef4444', '#a3e635'];

/** FNV-1a over the seed, so the same id always gives the same look. */
function hash(seed: string): number {
  let value = 0x811c9dc5;
  for (let index = 0; index < seed.length; index += 1) {
    value ^= seed.charCodeAt(index);
    value = Math.imul(value, 0x01000193) >>> 0;
  }
  return value;
}

function pick<T>(list: readonly T[], value: number): T {
  const item = list[value % list.length];
  if (item === undefined) throw new Error('pick needs a non-empty list');
  return item;
}

/**
 * A look derived from an id for an agent whose appearance is empty, so a roster never looks like
 * clones. The parts come from the set, so a smaller set still gives a valid look.
 */
export function defaultAppearance(set: CharacterSet, seed: string): Appearance {
  const { manifest } = set;
  const bodies = Object.keys(manifest.bodies);
  const hairs = Object.keys(manifest.parts.hair);
  const outfits = Object.keys(manifest.parts.outfit);
  const accessories = Object.keys(manifest.parts.accessory);
  const value = hash(seed);
  const accessoryRoll = (value >>> 20) % 3;
  return {
    body: bodies.length > 0 ? pick(bodies, value >>> 4) : undefined,
    hair: hairs.length > 0 ? pick(hairs, value >>> 8) : undefined,
    outfit:
      outfits.length > 0 && (value >>> 12) % 4 !== 0 ? pick(outfits, value >>> 14) : undefined,
    accessory:
      accessories.length > 0 && accessoryRoll === 0 ? pick(accessories, value >>> 24) : undefined,
    colors: {
      skin: pick(SKINS, value),
      hair: pick(HAIRS, value >>> 3),
      top: pick(TOPS, value >>> 6),
      bottom: pick(BOTTOMS, value >>> 9),
      accent: pick(ACCENTS, value >>> 11),
    },
  };
}

/** True when nothing was chosen. */
export function isEmptyAppearance(appearance: Appearance): boolean {
  return (
    appearance.body === undefined &&
    appearance.hair === undefined &&
    appearance.outfit === undefined &&
    appearance.accessory === undefined &&
    Object.keys(appearance.colors ?? {}).length === 0
  );
}

/** An agent's appearance when it set one, else its derived look. */
export function appearanceOf(set: CharacterSet, seed: string, appearance: Appearance): Appearance {
  return isEmptyAppearance(appearance) ? defaultAppearance(set, seed) : appearance;
}

/** What the owner's character wears until the owner customises it. */
export const OWNER_DEFAULT_APPEARANCE: Appearance = {
  body: 'regular',
  hair: 'short',
  outfit: 'vest',
};

/** The owner's appearance when set, else the default look. */
export function ownerAppearanceOf(appearance: Appearance | undefined): Appearance {
  return appearance === undefined || isEmptyAppearance(appearance)
    ? OWNER_DEFAULT_APPEARANCE
    : appearance;
}
