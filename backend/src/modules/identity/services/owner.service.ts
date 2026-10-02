import { ConflictException, Inject, Injectable } from '@nestjs/common';
import type { Owner } from '@tbn/contracts';
import {
  OWNER_REPOSITORY,
  type OwnerRepository,
} from '@/modules/identity/repositories/interface/owner_repository.interface';
import type { OwnerRecord } from '@/modules/identity/types/owner_record';
import { PasswordService } from './password.service';

/** Maps an owner row to the API shape. */
export function to_owner_view(record: Pick<OwnerRecord, 'id' | 'username' | 'created_at'>): Owner {
  return {
    id: record.id,
    username: record.username,
    created_at: record.created_at.toISOString(),
  };
}

/** Creates and reads owner accounts. */
@Injectable()
export class OwnerService {
  constructor(
    @Inject(OWNER_REPOSITORY) private readonly owners: OwnerRepository,
    private readonly passwords: PasswordService,
  ) {}

  /**
   * Creates an owner account.
   *
   * @throws ConflictException when the username is taken.
   */
  async create(username: string, password: string): Promise<Owner> {
    if ((await this.owners.find_by_username(username)) !== null) {
      throw new ConflictException('Username is taken');
    }
    const record = await this.owners.create(username, await this.passwords.hash(password));
    return to_owner_view(record);
  }

  /** How many owner accounts exist. */
  count(): Promise<number> {
    return this.owners.count();
  }
}
