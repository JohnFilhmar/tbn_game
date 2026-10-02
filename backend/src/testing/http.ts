import { z } from 'zod';

/** Body of a 400 from the Zod validation pipe. */
export const ValidationErrorBodySchema = z.object({
  statusCode: z.literal(400),
  message: z.literal('Validation failed'),
  issues: z.array(z.object({ path: z.string(), message: z.string() })),
});

/** Body of any other Nest HTTP exception. */
export const ErrorBodySchema = z.object({
  statusCode: z.number().int(),
  message: z.union([z.string(), z.array(z.string())]),
});
