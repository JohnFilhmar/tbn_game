import { Injectable } from '@nestjs/common';
import { hash, verify } from '@node-rs/argon2';

/** argon2id parameters, the OWASP minimum: 19 MiB, two passes, one lane. */
const ARGON2_OPTIONS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 };

/** Hashes and verifies owner passwords with argon2id. */
@Injectable()
export class PasswordService {
  /** Returns a PHC string that embeds the salt and the parameters. */
  hash(password: string): Promise<string> {
    return hash(password, ARGON2_OPTIONS);
  }

  /** True when `password` matches the hash. Never throws on a malformed hash. */
  async verify(password_hash: string, password: string): Promise<boolean> {
    try {
      return await verify(password_hash, password);
    } catch {
      return false;
    }
  }
}
