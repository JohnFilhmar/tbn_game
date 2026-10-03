import type { WorldLayoutRecord, WorldLayoutWrite } from '@/modules/world/types/world_records';

/** Injection token for `WorldLayoutRepository`. */
export const WORLD_LAYOUT_REPOSITORY = Symbol('WORLD_LAYOUT_REPOSITORY');

/** Layout rows, one per owner and environment, scoped by owner. */
export interface WorldLayoutRepository {
  find(owner_id: string, environment: string): Promise<WorldLayoutRecord | null>;
  find_by_id(owner_id: string, id: string): Promise<WorldLayoutRecord | null>;
  /**
   * Writes the layout when the stored revision is still `expected` (0 when none is stored), and
   * moves it to the next revision. Null when another save got there first.
   */
  save(
    owner_id: string,
    environment: string,
    expected: number,
    layout: WorldLayoutWrite,
  ): Promise<WorldLayoutRecord | null>;
  /** Removes the stored layout, so the pack default applies again. */
  remove(owner_id: string, environment: string): Promise<void>;
}
