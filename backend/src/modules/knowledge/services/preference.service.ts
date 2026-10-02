import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import {
  PREFERENCE_DEFAULTS,
  PreferenceKeySchema,
  PreferencesSchema,
  type PreferenceKey,
  type Preferences,
} from '@tbn/contracts';
import {
  PREFERENCE_REPOSITORY,
  type PreferenceRepository,
} from '@/modules/knowledge/repositories/interface/preference_repository.interface';

function assign<K extends PreferenceKey>(target: Preferences, key: K, value: Preferences[K]): void {
  target[key] = value;
}

/** Typed settings for the owner. Unknown or invalid stored values fall back to the default. */
@Injectable()
export class PreferenceService {
  constructor(@Inject(PREFERENCE_REPOSITORY) private readonly preferences: PreferenceRepository) {}

  /** Every preference, with defaults for the ones never set. */
  async get(owner_id: string): Promise<Preferences> {
    const result: Preferences = { ...PREFERENCE_DEFAULTS };
    for (const row of await this.preferences.list(owner_id)) {
      const key = PreferenceKeySchema.safeParse(row.key);
      if (!key.success) continue;
      const value = PreferencesSchema.shape[key.data].safeParse(row.value);
      if (value.success) assign(result, key.data, value.data);
    }
    return result;
  }

  /**
   * Sets one preference after checking the value against the key's schema.
   *
   * @throws BadRequestException when the value does not fit the key.
   */
  async set(owner_id: string, key: PreferenceKey, value: unknown): Promise<Preferences> {
    const parsed = PreferencesSchema.shape[key].safeParse(value);
    if (!parsed.success) {
      throw new BadRequestException(
        `${key}: ${parsed.error.issues[0]?.message ?? 'invalid value'}`,
      );
    }
    await this.preferences.set(owner_id, key, parsed.data);
    return this.get(owner_id);
  }
}
