/** A layout row. The theme and placements are JSON, checked against their schemas when read. */
export interface WorldLayoutRecord {
  id: string;
  environment: string;
  theme: unknown;
  placements: unknown;
  revision: number;
  updated_at: Date;
}

/** What a save writes: the theme and the placements, as JSON. */
export interface WorldLayoutWrite {
  theme: Record<string, string>;
  placements: ReadonlyArray<Record<string, string | number | null>>;
}

/** A prop state row. The state is JSON, checked against its kind's schema when read. */
export interface WorldPropStateRecord {
  id: string;
  environment: string;
  placement_id: string;
  kind: string;
  state: unknown;
  updated_at: Date;
}
