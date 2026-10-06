/** A guest chat row. */
export interface GuestChatRecord {
  id: string;
  owner_id: string;
  guest_id: string;
  agent_id: string;
  role: 'guest' | 'agent';
  text: string;
  is_error: boolean;
  created_at: Date;
}

/** The values a new guest chat line is stored with. */
export type GuestChatWrite = Pick<
  GuestChatRecord,
  'guest_id' | 'agent_id' | 'role' | 'text' | 'is_error'
>;
