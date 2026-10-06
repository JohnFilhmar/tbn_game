import { z } from 'zod';
import { DateTimeSchema, IdSchema } from './common';

/** A guest's display name: letters, digits, spaces, `_` and `-`. */
export const GuestNameSchema = z
  .string()
  .trim()
  .min(2)
  .max(24)
  .regex(/^[\p{L}\p{N} _-]+$/u, 'letters, digits, spaces, _ and -');

/**
 * A friend the owner invited. `name` is null until the guest picks one on their first visit;
 * `revoked_at` is set when the owner shut them out.
 */
export const GuestSchema = z.strictObject({
  id: IdSchema,
  name: GuestNameSchema.nullable(),
  last_seen_at: DateTimeSchema.nullable(),
  revoked_at: DateTimeSchema.nullable(),
  created_at: DateTimeSchema,
});

/** A guest as the API returns it. */
export type Guest = z.infer<typeof GuestSchema>;

/** Body of `PATCH /guests/me`: the guest's own name. */
export const UpdateGuestNameSchema = z.strictObject({ name: GuestSchema.shape.name.unwrap() });

/** Body of `PATCH /guests/me`. */
export type UpdateGuestName = z.infer<typeof UpdateGuestNameSchema>;

/**
 * A link the owner sends one friend. It works once, until `expires_at`. `label` is the owner's note
 * of who it is for; `guest_id` names the guest it signs back in, or is null for a new friend.
 */
export const GuestInviteSchema = z.strictObject({
  id: IdSchema,
  label: z.string().trim().min(1).max(64),
  guest_id: IdSchema.nullable(),
  expires_at: DateTimeSchema,
  redeemed_at: DateTimeSchema.nullable(),
  created_at: DateTimeSchema,
});

/** An invite as the API returns it. */
export type GuestInvite = z.infer<typeof GuestInviteSchema>;

/** Body of `POST /guests/invites`. */
export const CreateGuestInviteSchema = GuestInviteSchema.pick({
  label: true,
  guest_id: true,
}).partial({ guest_id: true });

/** Body of `POST /guests/invites`. */
export type CreateGuestInvite = z.infer<typeof CreateGuestInviteSchema>;

/** Response of `POST /guests/invites`: the invite and its link path, shown this once. */
export const CreatedGuestInviteSchema = z.strictObject({
  invite: GuestInviteSchema,
  path: z.string().startsWith('/invite/'),
});

/** Response of `POST /guests/invites`. */
export type CreatedGuestInvite = z.infer<typeof CreatedGuestInviteSchema>;

/** Who is signed in: the owner, or one of the owner's guests. Response of `GET /auth/me`. */
export const PrincipalSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('owner'), id: IdSchema, username: z.string() }),
  z.strictObject({
    kind: z.literal('guest'),
    id: IdSchema,
    name: GuestSchema.shape.name,
    owner_username: z.string(),
  }),
]);

/** Response of `GET /auth/me`. */
export type Principal = z.infer<typeof PrincipalSchema>;
