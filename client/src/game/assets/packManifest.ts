import { EnvironmentNameSchema, WorldPlacementSchema } from '@tbn/contracts';
import { z } from 'zod';
import { ClipNameSchema } from './clipNames';

/** A hex colour such as `#ffcc00`. */
export const HexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);

/** A position in metres: `[x, y, z]`, Y up. */
export const Vec3Schema = z.tuple([z.number(), z.number(), z.number()]);

/** A position in metres. */
export type Vec3 = z.infer<typeof Vec3Schema>;

/** A place to stand and the way to face: yaw 0 faces +Z, yaw 90 faces +X. */
export const AnchorSchema = z.strictObject({ position: Vec3Schema, yaw_deg: z.number() });

/** A place to stand and the way to face. */
export type Anchor = z.infer<typeof AnchorSchema>;

/** A desk: the centre of its top, the way a seated character faces, and where it sits. */
export const DeskAnchorSchema = AnchorSchema.extend({ seat: Vec3Schema });

/** A desk. */
export type DeskAnchor = z.infer<typeof DeskAnchorSchema>;

/** The in-world computer: its screen, and how close on the floor the owner must be to use it. */
export const ComputerAnchorSchema = AnchorSchema.extend({ use_radius: z.number().positive() });

/** The in-world computer. */
export type ComputerAnchor = z.infer<typeof ComputerAnchorSchema>;

/** What an idle agent goes to a spot for. */
export const SpotKindSchema = z.enum([
  'water',
  'window',
  'plant',
  'board',
  'grass',
  'stretch',
  'look',
]);

/** A place an idle agent wanders to: where it stands, its facing, the clip it plays and how long. */
export const SpotSchema = AnchorSchema.extend({
  kind: SpotKindSchema,
  clip: ClipNameSchema,
  seconds: z.number().positive(),
});

/** A spot. */
export type Spot = z.infer<typeof SpotSchema>;

/** A department's zone: its desks, the manager's first. A layout makes them from its zone rugs. */
export interface Zone {
  name: string;
  label: string;
  desks: DeskAnchor[];
}

/** A light inside the pack, on from dusk. */
export const InteriorLightSchema = z.strictObject({
  position: Vec3Schema,
  color: HexColorSchema,
  intensity: z.number().min(0),
  distance: z.number().positive(),
});

/** The pack's lighting profile; the time of day supplies the sun and the sky. */
export const LightingSchema = z.strictObject({
  ambient: HexColorSchema,
  sun_azimuth_deg: z.number(),
  interior: InteriorLightSchema.array(),
});

/** The floor rectangle of a pack. */
export const BoundsSchema = z.strictObject({
  min_x: z.number(),
  max_x: z.number(),
  min_z: z.number(),
  max_z: z.number(),
});

/** The floor rectangle of a pack. */
export type Bounds = z.infer<typeof BoundsSchema>;

/** Floor nobody walks through: a wall of the shell. */
export const FootprintSchema = z.strictObject({
  minX: z.number(),
  maxX: z.number(),
  minZ: z.number(),
  maxZ: z.number(),
});

/** An environment pack's `manifest.json`, as `docs/assets.md` describes it. */
export const PackManifestSchema = z.strictObject({
  name: EnvironmentNameSchema,
  title: z.string().min(1),
  scale: z.number().positive(),
  scene: z.string().min(1),
  bounds: BoundsSchema,
  ceiling: z.number().positive(),
  spawn: AnchorSchema,
  entry: AnchorSchema,
  exit: AnchorSchema,
  waiting: AnchorSchema.array().min(1),
  /** The shell's own spots; the props bring theirs. */
  spots: SpotSchema.array(),
  /** The floor the shell's walls block. */
  blocks: FootprintSchema.array(),
  lighting: LightingSchema,
  /** The props the pack starts with, until the owner saves a layout of their own. */
  default_layout: WorldPlacementSchema.array().min(1),
});

/** An environment pack's manifest. */
export type PackManifest = z.infer<typeof PackManifestSchema>;
