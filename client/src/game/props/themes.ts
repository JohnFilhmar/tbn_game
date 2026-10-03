import { ThemeSlotSchema, type ThemeSlot, type WorldTheme } from '@tbn/contracts';
import { BASE_MATERIALS } from './furniture';

/** A theme the owner can start from, by name. Classic keeps every pack's own colours. */
export const THEME_PRESETS: Record<string, WorldTheme> = {
  Classic: {},
  'Night shift': {
    floor: '#2b3242',
    wall: '#3a4256',
    wood: '#5b4a3c',
    metal: '#6d7686',
    fabric: '#7a4fa0',
    partition: '#47506a',
    board: '#d9dce6',
    counter: '#4b5366',
    concrete: '#3c4250',
    accent: '#38d0c0',
  },
  Pastel: {
    floor: '#efe2d6',
    wall: '#fbf3ea',
    wood: '#e8c39e',
    metal: '#b8c4d6',
    fabric: '#f2a7b8',
    plant: '#8fd1a0',
    pot: '#f0b48c',
    partition: '#d9e7f2',
    counter: '#f7e3c8',
    accent: '#9fc4f2',
  },
  Industrial: {
    floor: '#7d7a74',
    wall: '#a19c93',
    wood: '#6f5139',
    metal: '#4b4f56',
    fabric: '#5b6a52',
    partition: '#8c8a83',
    counter: '#6a6c70',
    concrete: '#6f6f6f',
    accent: '#e2a12b',
  },
};

/** The slots a theme can colour, in the order the theme panel lists them. */
export const THEME_SLOTS: readonly ThemeSlot[] = ThemeSlotSchema.options;

const SLOT_NAMES = new Set<string>(THEME_SLOTS);

/** True for a material name a theme colours. */
export function isThemeSlot(name: string): name is ThemeSlot {
  return SLOT_NAMES.has(name);
}

/**
 * The colour of a material under a theme: the theme's own for the slot, else `fallback` (the
 * colour the pack or the prop was made with), else the base palette's.
 */
export function themeColor(theme: WorldTheme, name: string, fallback?: string): string {
  const own = isThemeSlot(name) ? theme[name] : undefined;
  return own ?? fallback ?? BASE_MATERIALS[name] ?? '#cccccc';
}
