/** An owner row. */
export interface OwnerRecord {
  id: string;
  username: string;
  password_hash: string;
  created_at: Date;
}

/** A session row with the owner it belongs to. */
export interface SessionRecord {
  id: string;
  owner_id: string;
  token_hash: string;
  expires_at: Date;
  last_seen_at: Date;
  owner: Pick<OwnerRecord, 'id' | 'username'>;
}
