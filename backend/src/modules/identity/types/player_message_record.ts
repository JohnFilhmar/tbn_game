/** A player message row. */
export interface PlayerMessageRecord {
  id: string;
  owner_id: string;
  from_id: string;
  from_name: string;
  to_id: string;
  text: string;
  read_at: Date | null;
  created_at: Date;
}

/** The values a new player message is stored with. */
export type PlayerMessageWrite = Pick<
  PlayerMessageRecord,
  'from_id' | 'from_name' | 'to_id' | 'text'
>;
