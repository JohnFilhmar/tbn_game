import { z } from 'zod';
import { DateTimeSchema, IdSchema } from './common';
import { EnvironmentNameSchema } from './knowledge';

const HexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'a colour like #a1b2c3');

/** A share of the board, 0 at its left or top edge and 1 at its right or bottom edge. */
const BoardCoordinateSchema = z.number().min(0).max(1);

/** The most strokes one whiteboard keeps. */
export const MOST_WHITEBOARD_STROKES = 2_000;

/** The most bytes a whiteboard's content takes as JSON; a larger one answers 413. */
export const MOST_WHITEBOARD_BYTES = 256 * 1024;

/** Window blinds: open or closed. */
export const BlindsStateSchema = z.strictObject({ open: z.boolean() });

/** A lamp follows the time of day on `auto`, or stays on or off. */
export const LampModeSchema = z.enum(['auto', 'on', 'off']);

/** `auto`, `on` or `off`. */
export type LampMode = z.infer<typeof LampModeSchema>;

/** A lamp's switch. */
export const LampStateSchema = z.strictObject({ mode: LampModeSchema });

/** One pen line on a whiteboard: its points in board shares, its colour and its width. */
export const WhiteboardStrokeSchema = z.strictObject({
  color: HexColorSchema,
  /** The line's width as a share of the board's height. */
  width: z.number().min(0.001).max(0.05),
  points: z
    .array(z.tuple([BoardCoordinateSchema, BoardCoordinateSchema]))
    .min(1)
    .max(2_000),
});

/** A line of pen on a whiteboard. */
export type WhiteboardStroke = z.infer<typeof WhiteboardStrokeSchema>;

/** Text written on a whiteboard, its left edge and baseline at (`x`, `y`). */
export const WhiteboardTextSchema = z.strictObject({
  x: BoardCoordinateSchema,
  y: BoardCoordinateSchema,
  color: HexColorSchema,
  /** The letters' height as a share of the board's height. */
  size: z.number().min(0.02).max(0.3),
  text: z.string().trim().min(1).max(200),
});

/** Text on a whiteboard. */
export type WhiteboardText = z.infer<typeof WhiteboardTextSchema>;

/**
 * What is on a whiteboard, as vectors: small, sharp at any size, and erasable one stroke at a
 * time.
 */
export const WhiteboardContentSchema = z.strictObject({
  strokes: z.array(WhiteboardStrokeSchema).max(MOST_WHITEBOARD_STROKES),
  texts: z.array(WhiteboardTextSchema).max(200),
});

/** A whiteboard's content. */
export type WhiteboardContent = z.infer<typeof WhiteboardContentSchema>;

const PROP_STATE_FIELDS = {
  id: IdSchema,
  environment: EnvironmentNameSchema,
  /** The placed prop this state belongs to, in the saved layout or the pack default. */
  placement_id: IdSchema,
  updated_at: DateTimeSchema,
};

/** The state of a placed window blinds prop. */
export const BlindsPropStateSchema = z.strictObject({
  ...PROP_STATE_FIELDS,
  kind: z.literal('blinds'),
  state: BlindsStateSchema,
});

/** The state of a placed lamp. */
export const LampPropStateSchema = z.strictObject({
  ...PROP_STATE_FIELDS,
  kind: z.literal('lamp'),
  state: LampStateSchema,
});

/** What is drawn on a placed whiteboard. */
export const WhiteboardPropStateSchema = z.strictObject({
  ...PROP_STATE_FIELDS,
  kind: z.literal('whiteboard'),
  state: WhiteboardContentSchema,
});

/**
 * A placed prop's own state, kept apart from the layout so using a prop never moves the layout's
 * revision. A prop with no row is in its kind's first state: blinds open, a lamp on auto, a board
 * empty.
 */
export const WorldPropStateSchema = z.discriminatedUnion('kind', [
  BlindsPropStateSchema,
  LampPropStateSchema,
  WhiteboardPropStateSchema,
]);

/** A placed prop's state. */
export type WorldPropState = z.infer<typeof WorldPropStateSchema>;

/** The kinds of prop that keep a state. */
export type StatefulPropKind = WorldPropState['kind'];

/** Body of `PUT /world/:environment/props/:placement_id`: the kind and its whole new state. */
export const SaveWorldPropStateSchema = z.discriminatedUnion('kind', [
  BlindsPropStateSchema.pick({ kind: true, state: true }),
  LampPropStateSchema.pick({ kind: true, state: true }),
  WhiteboardPropStateSchema.pick({ kind: true, state: true }),
]);

/** Body of `PUT /world/:environment/props/:placement_id`. */
export type SaveWorldPropState = z.infer<typeof SaveWorldPropStateSchema>;

/** Answer of `GET /world/:environment/props`: every saved prop state of the environment. */
export const WorldPropStatesResponseSchema = z.strictObject({
  states: z.array(WorldPropStateSchema),
});

/** Answer of `GET /world/:environment/props`. */
export type WorldPropStatesResponse = z.infer<typeof WorldPropStatesResponseSchema>;
