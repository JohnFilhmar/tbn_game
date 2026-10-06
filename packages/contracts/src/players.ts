import { z } from 'zod';
import { DateTimeSchema, IdSchema } from './common';
import { EnvironmentNameSchema } from './knowledge';

/**
 * One line of a guest's conversation with an agent's persona, never part of the agent's own
 * transcript. `is_error` marks a reply the guest model could not give.
 */
export const GuestChatMessageSchema = z.strictObject({
  id: IdSchema,
  guest_id: IdSchema,
  agent_id: IdSchema,
  role: z.enum(['guest', 'agent']),
  text: z.string().trim().min(1).max(20_000),
  is_error: z.boolean(),
  created_at: DateTimeSchema,
});

/** A guest chat line as the API returns it. */
export type GuestChatMessage = z.infer<typeof GuestChatMessageSchema>;

/** Body of `POST /agents/:id/guest_chat`. */
export const SendGuestChatMessageSchema = GuestChatMessageSchema.pick({ text: true });

/** Body of `POST /agents/:id/guest_chat`. */
export type SendGuestChatMessage = z.infer<typeof SendGuestChatMessageSchema>;

/**
 * A message between two players, the owner or a guest, each named by id. Only its two players
 * receive it.
 */
export const PlayerMessageSchema = z.strictObject({
  id: IdSchema,
  from_id: IdSchema,
  from_name: z.string(),
  to_id: IdSchema,
  text: z.string().trim().min(1).max(4_000),
  read_at: DateTimeSchema.nullable(),
  created_at: DateTimeSchema,
});

/** A player message as the API returns it. */
export type PlayerMessage = z.infer<typeof PlayerMessageSchema>;

/** Body of `POST /player_messages`. */
export const SendPlayerMessageSchema = PlayerMessageSchema.pick({ to_id: true, text: true });

/** Body of `POST /player_messages`. */
export type SendPlayerMessage = z.infer<typeof SendPlayerMessageSchema>;

/** Body of `POST /player_messages/read`: marks every message from that player as read. */
export const ReadPlayerMessagesSchema = PlayerMessageSchema.pick({ from_id: true });

/** Body of `POST /player_messages/read`. */
export type ReadPlayerMessages = z.infer<typeof ReadPlayerMessagesSchema>;

/** Where a player stands and what they do, sent a few times a second. Never stored. */
export const PlayerPoseSchema = z.strictObject({
  environment: EnvironmentNameSchema,
  x: z.number().finite(),
  y: z.number().finite(),
  z: z.number().finite(),
  yaw: z.number().finite(),
  moving: z.boolean(),
  running: z.boolean(),
  seated: z.boolean(),
});

/** A player's pose. */
export type PlayerPose = z.infer<typeof PlayerPoseSchema>;

/**
 * A person in the owner's world: the owner or a guest. A player who left stays `online: false`
 * for a while before they are gone.
 */
export const PlayerSchema = z.strictObject({
  id: IdSchema,
  kind: z.enum(['owner', 'guest']),
  name: z.string(),
  pose: PlayerPoseSchema.nullable(),
  online: z.boolean(),
  offline_at: DateTimeSchema.nullable(),
});

/** A player. */
export type Player = z.infer<typeof PlayerSchema>;

/** How long a player who left stays in the world before walking out. */
export const PLAYER_LINGER_MS = 20 * 60_000;

/** Payload of the gateway's `player_gone` message: a player who left long enough ago. */
export const PlayerGoneSchema = z.strictObject({ id: IdSchema });
