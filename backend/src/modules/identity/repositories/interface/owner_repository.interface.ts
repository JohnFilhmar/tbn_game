import type { OwnerRecord } from '@/modules/identity/types/owner_record';

/** Injection token for `OwnerRepository`. */
export const OWNER_REPOSITORY = Symbol('OWNER_REPOSITORY');

/** Owner rows. Owners are the one table without an `owner_id` scope. */
export interface OwnerRepository {
  find_by_username(username: string): Promise<OwnerRecord | null>;
  find_by_id(id: string): Promise<OwnerRecord | null>;
  create(username: string, password_hash: string): Promise<OwnerRecord>;
  count(): Promise<number>;
}
