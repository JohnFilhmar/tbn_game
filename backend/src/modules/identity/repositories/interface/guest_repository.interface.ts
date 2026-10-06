import type {
  GuestInviteRecord,
  GuestInviteWrite,
  GuestRecord,
  GuestSessionRecord,
  GuestSessionWrite,
} from '@/modules/identity/types/guest_record';

/** Injection token for `GuestRepository`. */
export const GUEST_REPOSITORY = Symbol('GUEST_REPOSITORY');

/** Guests, their invites and their sessions. Tokens are stored only as hashes. */
export interface GuestRepository {
  create_invite(owner_id: string, write: GuestInviteWrite): Promise<GuestInviteRecord>;
  /** Invites not yet used, revoked or expired, newest first. */
  list_open_invites(owner_id: string, now: Date): Promise<GuestInviteRecord[]>;
  /** False when no open invite has the id. */
  revoke_invite(owner_id: string, id: string, now: Date): Promise<boolean>;
  /**
   * Uses an open invite once: signs back in the guest it names, or creates a new guest, and opens a
   * session for them. Null when the invite is unknown, used, revoked or expired, or its guest was
   * revoked.
   */
  redeem_invite(
    token_hash: string,
    now: Date,
    session: GuestSessionWrite,
  ): Promise<GuestRecord | null>;
  /** The live session behind a token hash, null when it expired or its guest was revoked. */
  find_session(token_hash: string, now: Date): Promise<GuestSessionRecord | null>;
  touch_guest(id: string, now: Date): Promise<void>;
  list_guests(owner_id: string): Promise<GuestRecord[]>;
  find_guest(owner_id: string, id: string): Promise<GuestRecord | null>;
  /** True when another of the owner's guests has `name`, ignoring case. */
  is_name_taken(owner_id: string, name: string, except_id: string): Promise<boolean>;
  set_name(owner_id: string, id: string, name: string): Promise<GuestRecord>;
  /** Shuts the guest out and ends their sessions. Null when the guest is unknown. */
  revoke_guest(owner_id: string, id: string, now: Date): Promise<GuestRecord | null>;
}
