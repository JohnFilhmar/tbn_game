import type { PreferenceRecord } from '@/modules/knowledge/types/knowledge_records';

/** Injection token for `PreferenceRepository`. */
export const PREFERENCE_REPOSITORY = Symbol('PREFERENCE_REPOSITORY');

/** Preference rows, scoped by owner. */
export interface PreferenceRepository {
  list(owner_id: string): Promise<PreferenceRecord[]>;
  set(owner_id: string, key: string, value: string | number | boolean): Promise<void>;
}
