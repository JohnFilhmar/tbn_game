import { z } from 'zod';

/** The names of the clips every body carries. */
export const ClipNameSchema = z.enum([
  'idle',
  'walk',
  'work',
  'sit',
  'wave',
  'drink',
  'look',
  'write',
  'touch',
  'stretch',
  'talk',
  'press',
]);

/** A clip name. */
export type ClipName = z.infer<typeof ClipNameSchema>;
