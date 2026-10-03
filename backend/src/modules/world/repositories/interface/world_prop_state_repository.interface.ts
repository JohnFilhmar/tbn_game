import type { WorldPropStateRecord } from '@/modules/world/types/world_records';

/** Injection token for `WorldPropStateRepository`. */
export const WORLD_PROP_STATE_REPOSITORY = Symbol('WORLD_PROP_STATE_REPOSITORY');

/** What a prop state save writes: the placement it belongs to, its kind and the state as JSON. */
export interface WorldPropStateWrite {
  environment: string;
  placement_id: string;
  kind: string;
  state: object;
}

/** Prop state rows, one per owner and placement, scoped by owner. */
export interface WorldPropStateRepository {
  list(owner_id: string, environment: string): Promise<WorldPropStateRecord[]>;
  find_by_id(owner_id: string, id: string): Promise<WorldPropStateRecord | null>;
  /** Writes the placement's state, creating its row the first time. */
  save(owner_id: string, write: WorldPropStateWrite): Promise<WorldPropStateRecord>;
}
