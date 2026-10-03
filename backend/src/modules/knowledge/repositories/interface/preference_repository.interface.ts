import type { PreferenceRecord } from '@/modules/knowledge/types/knowledge_records';

/** Injection token for `PreferenceRepository`. */
export const PREFERENCE_REPOSITORY = Symbol('PREFERENCE_REPOSITORY');

/** What a preference stores: a scalar, or an object of them such as an appearance. */
export type PreferenceValue =
  string | number | boolean | { readonly [key: string]: PreferenceValue | undefined };

/** Preference rows, scoped by owner. */
export interface PreferenceRepository {
  list(owner_id: string): Promise<PreferenceRecord[]>;
  set(owner_id: string, key: string, value: PreferenceValue): Promise<void>;
  /** Removes a stored value, so the default applies again. */
  unset(owner_id: string, key: string): Promise<void>;
}
