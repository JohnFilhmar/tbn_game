/** A guest row. */
export interface GuestRecord {
  id: string;
  owner_id: string;
  name: string | null;
  last_seen_at: Date | null;
  revoked_at: Date | null;
  created_at: Date;
}

/** An invite row; the token itself is never stored. */
export interface GuestInviteRecord {
  id: string;
  owner_id: string;
  guest_id: string | null;
  label: string;
  expires_at: Date;
  redeemed_at: Date | null;
  revoked_at: Date | null;
  created_at: Date;
}

/** The values a new invite is stored with. */
export interface GuestInviteWrite {
  label: string;
  guest_id: string | null;
  token_hash: string;
  expires_at: Date;
}

/** A live guest session with its guest and the host owner's username. */
export interface GuestSessionRecord {
  id: string;
  expires_at: Date;
  guest: GuestRecord;
  owner_username: string;
}

/** The session a redeemed invite opens. */
export interface GuestSessionWrite {
  token_hash: string;
  expires_at: Date;
}
