import { z } from 'zod';
import { DateTimeSchema, IdSchema } from './common';
import { EnvironmentNameSchema, type EnvironmentName } from './knowledge';

/** The props an owner can place: furniture, plants, and the zone rugs that make departments. */
export const PropKindSchema = z.enum([
  'desk',
  'computer_desk',
  'table',
  'partition',
  'plant',
  'tree',
  'sofa',
  'low_table',
  'shelf',
  'counter',
  'fridge',
  'pallet',
  'forklift',
  'water_cooler',
  'whiteboard',
  'rug',
  'zone_rug',
  'coffee_set',
  'blinds',
  'lamp',
  'light_switch',
  'grass_patch',
  'inbox_tray',
  'cork_board',
  'server_rack',
  'wall_clock',
  'beanbag',
  'exit_sign',
  'trophy_shelf',
  'radio',
]);

/** A prop kind. */
export type PropKind = z.infer<typeof PropKindSchema>;

/** The material slots a theme colours, shared by the shell and every prop. */
export const ThemeSlotSchema = z.enum([
  'floor',
  'wall',
  'wood',
  'metal',
  'fabric',
  'plant',
  'pot',
  'partition',
  'board',
  'counter',
  'grass',
  'concrete',
  'accent',
]);

/** A theme slot. */
export type ThemeSlot = z.infer<typeof ThemeSlotSchema>;

const HexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'a colour like #a1b2c3');

/** A theme: a colour for any slot; a slot left out keeps the pack's own colour. */
export const WorldThemeSchema = z.partialRecord(ThemeSlotSchema, HexColorSchema);

/** A world theme. */
export type WorldTheme = z.infer<typeof WorldThemeSchema>;

/**
 * One prop in an environment: its kind, where it stands on the floor and which way it faces.
 * `width` and `depth` size the kinds that come in any size (tables, partitions, shelves,
 * counters, rugs, zone rugs); `zone` numbers a zone rug's department; `variant` picks a
 * material where a kind has two; `color` repaints this prop alone.
 */
export const WorldPlacementSchema = z.strictObject({
  id: IdSchema,
  kind: PropKindSchema,
  x: z.number().finite(),
  z: z.number().finite(),
  yaw_deg: z.number().finite().min(-360).max(360),
  width: z.number().positive().max(24).nullable(),
  depth: z.number().positive().max(24).nullable(),
  zone: z.int().min(1).max(8).nullable(),
  variant: z.string().trim().min(1).max(32).nullable(),
  color: HexColorSchema.nullable(),
});

/** A placed prop. */
export type WorldPlacement = z.infer<typeof WorldPlacementSchema>;

/** The most props one environment holds. */
export const MOST_PLACEMENTS = 400;

/**
 * An environment as the owner arranged it: its theme and every prop, with a revision that grows
 * with each save, so two tabs saving at once cannot overwrite each other unseen.
 */
export const WorldLayoutSchema = z.strictObject({
  id: IdSchema,
  environment: EnvironmentNameSchema,
  theme: WorldThemeSchema,
  placements: WorldPlacementSchema.array().max(MOST_PLACEMENTS),
  revision: z.int().min(1),
  updated_at: DateTimeSchema,
});

/** A saved layout. */
export type WorldLayout = z.infer<typeof WorldLayoutSchema>;

/**
 * Body of `PUT /world/:environment`: the whole layout, and the revision the owner started from,
 * 0 when nothing was saved yet. A save from an older revision is refused with 409.
 */
export const SaveWorldLayoutSchema = WorldLayoutSchema.pick({
  theme: true,
  placements: true,
}).extend({ revision: z.int().min(0) });

/** Body of `PUT /world/:environment`. */
export type SaveWorldLayout = z.infer<typeof SaveWorldLayoutSchema>;

/** Answer of `GET /world/:environment`: the saved layout, or null when the pack default applies. */
export const WorldLayoutResponseSchema = z.strictObject({ layout: WorldLayoutSchema.nullable() });

/** Answer of `GET /world/:environment`. */
export type WorldLayoutResponse = z.infer<typeof WorldLayoutResponseSchema>;

/** The floor of an environment, in metres. */
export interface WorldBounds {
  min_x: number;
  max_x: number;
  min_z: number;
  max_z: number;
}

/** Each environment's floor, the same bounds its pack manifest carries. */
export const ENVIRONMENT_BOUNDS: Record<EnvironmentName, WorldBounds> = {
  office: { min_x: -11, max_x: 11, min_z: -8, max_z: 8 },
  home: { min_x: -9, max_x: 9, min_z: -7, max_z: 7 },
  warehouse: { min_x: -12, max_x: 12, min_z: -8, max_z: 8 },
};
