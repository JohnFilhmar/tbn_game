import type { CapWindowRecord, CapWindowWrite } from '@/modules/runtime/types/cap_window_record';

/** Injection token for `CapWindowRepository`. */
export const CAP_WINDOW_REPOSITORY = Symbol('CAP_WINDOW_REPOSITORY');

/** Cap window rows of one provider key, scoped by owner. */
export interface CapWindowRepository {
  list(owner_id: string, provider_id: string): Promise<CapWindowRecord[]>;
  find(owner_id: string, provider_id: string, id: string): Promise<CapWindowRecord | null>;
  create(owner_id: string, provider_id: string, data: CapWindowWrite): Promise<CapWindowRecord>;
  /** Returns null when the row is missing. */
  update(
    owner_id: string,
    provider_id: string,
    id: string,
    data: Partial<CapWindowWrite>,
  ): Promise<CapWindowRecord | null>;
  /** Returns false when the row is missing. */
  delete(owner_id: string, provider_id: string, id: string): Promise<boolean>;
}
