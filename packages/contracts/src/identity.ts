import { z } from 'zod';
import { DateTimeSchema, IdSchema } from './common';

/** The owner account. The password never leaves the server. */
export const OwnerSchema = z.strictObject({
  id: IdSchema,
  username: z
    .string()
    .min(3)
    .max(64)
    .regex(/^[a-z0-9_]+$/, 'lowercase letters, digits and underscores'),
  created_at: DateTimeSchema,
});

/** The owner account as the API returns it. */
export type Owner = z.infer<typeof OwnerSchema>;

/** The password rules, shared by owner creation and login. Write-only, never returned. */
export const PasswordSchema = z.string().min(12).max(512);

/** Body of `POST /auth/login`. */
export const LoginRequestSchema = OwnerSchema.pick({ username: true }).extend({
  password: PasswordSchema,
});

/** Body of `POST /auth/login`. */
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

/** A session token and when it stops working. */
export const SessionSchema = z.strictObject({
  token: z.string().min(1),
  expires_at: DateTimeSchema,
});

/** Response of `POST /auth/login`. */
export type Session = z.infer<typeof SessionSchema>;
