import { randomBytes } from 'node:crypto';
import type { INestApplicationContext } from '@nestjs/common';
import { AuthService } from '@/modules/identity/services/auth.service';
import { OwnerService } from '@/modules/identity/services/owner.service';

/** A fresh owner with a live session, for tests. */
export interface TestOwner {
  owner_id: string;
  username: string;
  password: string;
  token: string;
}

/**
 * Creates an owner with a unique username and logs it in. Every test file gets its own owner, so
 * owner scoping keeps test data apart without truncating tables.
 *
 * @param app - A running application or context that includes the identity module.
 */
export async function create_test_owner(app: INestApplicationContext): Promise<TestOwner> {
  const username = `test_${randomBytes(6).toString('hex')}`;
  const password = `pw_${randomBytes(12).toString('hex')}`;
  const owner = await app.get(OwnerService).create(username, password);
  const session = await app.get(AuthService).login(username, password);
  if (session === null) throw new Error('Test owner could not log in');
  return { owner_id: owner.id, username, password, token: session.token };
}
