import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { AppConfig } from '@/config/config.schema';
import { APP_CONFIG } from '@/config/config.tokens';

const FORMAT_VERSION = 'v1';
const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;

/** Raised when a sealed value cannot be opened: wrong key, tampering or an unknown format. */
export class SecretBoxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SecretBoxError';
  }
}

/**
 * Encrypts secrets at rest with AES-256-GCM under `SECRETS_ENCRYPTION_KEY`. A sealed value is
 * `v1.<iv>.<tag>.<ciphertext>` in base64url, so the format can change without a migration of the
 * key. Plaintext never leaves this service except through `open`.
 */
@Injectable()
export class SecretBoxService {
  private readonly key: Buffer;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.key = Buffer.from(config.secrets_encryption_key, 'base64');
    if (this.key.length !== KEY_BYTES) {
      throw new SecretBoxError(`SECRETS_ENCRYPTION_KEY must decode to ${KEY_BYTES} bytes`);
    }
  }

  /** Seals a plaintext. Every call uses a fresh random nonce. */
  seal(plaintext: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [
      FORMAT_VERSION,
      iv.toString('base64url'),
      tag.toString('base64url'),
      ciphertext.toString('base64url'),
    ].join('.');
  }

  /**
   * Opens a sealed value.
   *
   * @throws SecretBoxError when the value was sealed under another key, was altered, or has an
   * unknown format.
   */
  open(sealed: string): string {
    const parts = sealed.split('.');
    if (parts.length !== 4 || parts[0] !== FORMAT_VERSION) {
      throw new SecretBoxError('Unknown sealed value format');
    }
    const iv = Buffer.from(parts[1] ?? '', 'base64url');
    const tag = Buffer.from(parts[2] ?? '', 'base64url');
    const ciphertext = Buffer.from(parts[3] ?? '', 'base64url');
    if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
      throw new SecretBoxError('Malformed sealed value');
    }
    const decipher = createDecipheriv(ALGORITHM, this.key, iv);
    decipher.setAuthTag(tag);
    try {
      return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
    } catch {
      throw new SecretBoxError('Sealed value cannot be opened with this key');
    }
  }
}
