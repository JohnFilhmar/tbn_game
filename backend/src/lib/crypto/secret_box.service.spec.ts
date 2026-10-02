import { load_test_config } from '@/testing/test_app';
import { SecretBoxError, SecretBoxService } from './secret_box.service';

const OTHER_KEY = Buffer.alloc(32, 7).toString('base64');

describe('SecretBoxService', () => {
  const box = new SecretBoxService(load_test_config());

  it('round-trips a secret and never repeats a ciphertext', () => {
    const first = box.seal('sk-ant-secret');
    const second = box.seal('sk-ant-secret');

    expect(first).not.toBe(second);
    expect(first).not.toContain('sk-ant');
    expect(box.open(first)).toBe('sk-ant-secret');
    expect(box.open(second)).toBe('sk-ant-secret');
  });

  it('rejects a tampered value', () => {
    const sealed = box.seal('secret');
    const parts = sealed.split('.');
    const ciphertext = Buffer.from(parts[3] ?? '', 'base64url');
    ciphertext[0] = (ciphertext[0] ?? 0) ^ 0xff;
    const tampered = [parts[0], parts[1], parts[2], ciphertext.toString('base64url')].join('.');

    expect(() => box.open(tampered)).toThrow(SecretBoxError);
  });

  it('rejects a value sealed under another key', () => {
    const other = new SecretBoxService({
      ...load_test_config(),
      secrets_encryption_key: OTHER_KEY,
    });

    expect(() => box.open(other.seal('secret'))).toThrow(SecretBoxError);
  });

  it('rejects an unknown format and a short key', () => {
    expect(() => box.open('v0.a.b.c')).toThrow(SecretBoxError);
    expect(() => box.open('not sealed')).toThrow(SecretBoxError);
    expect(
      () =>
        new SecretBoxService({
          ...load_test_config(),
          secrets_encryption_key: Buffer.alloc(16).toString('base64'),
        }),
    ).toThrow(SecretBoxError);
  });
});
