import { z } from 'zod';
import { HexColorSchema } from './packManifest';

/** The kinds of part a character wears. */
export const PartKindSchema = z.enum(['hair', 'outfit', 'accessory']);

/** `hair`, `outfit` or `accessory`. */
export type PartKind = z.infer<typeof PartKindSchema>;

/** The body nodes a part attaches to. */
export const AttachNodeSchema = z.enum(['head', 'spine']);

/** The material slots an appearance recolours. */
export const PaletteSlotSchema = z.enum(['skin', 'hair', 'top', 'bottom', 'shoes', 'accent']);

/** A palette slot. */
export type PaletteSlot = z.infer<typeof PaletteSlotSchema>;

/** The names of the clips every body carries. */
export const ClipNameSchema = z.enum(['idle', 'walk', 'work', 'sit', 'wave']);

/** A clip name. */
export type ClipName = z.infer<typeof ClipNameSchema>;

const PartFilesSchema = z.record(z.string().min(1), z.string().min(1));

/** The character set's `manifest.json`, as `docs/assets.md` describes it. */
export const CharacterManifestSchema = z.strictObject({
  version: z.literal(1),
  scale: z.number().positive(),
  bodies: z
    .record(
      z.string().min(1),
      z.strictObject({
        file: z.string().min(1),
        width: z.number().positive(),
        height: z.number().positive(),
      }),
    )
    .refine((bodies) => 'regular' in bodies, 'the regular body is the default and must exist'),
  clips: ClipNameSchema.array().min(1),
  attach: z.strictObject({
    hair: AttachNodeSchema,
    outfit: AttachNodeSchema,
    accessory: AttachNodeSchema,
  }),
  parts: z.strictObject({
    hair: PartFilesSchema,
    outfit: PartFilesSchema,
    accessory: PartFilesSchema,
  }),
  palette: z.strictObject({
    skin: HexColorSchema,
    hair: HexColorSchema,
    top: HexColorSchema,
    bottom: HexColorSchema,
    shoes: HexColorSchema,
    accent: HexColorSchema,
  }),
});

/** The character set's manifest. */
export type CharacterManifest = z.infer<typeof CharacterManifestSchema>;
