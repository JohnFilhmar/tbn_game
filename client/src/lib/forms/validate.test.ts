import { CreateProviderSchema, LoginRequestSchema } from '@tbn/contracts';
import { describe, expect, it } from 'vitest';
import { EMPTY_PROVIDER_DRAFT, providerInput } from '@/screens/providers/providerDraft';
import { isoOfLocalInput, localInputOf } from './dates';
import { numberOrNull, numberText, optionalNumber } from './numbers';
import { nullableText, optionalText } from './text';
import { errorsFromIssues, validate } from './validate';

describe('form validation with the contracts schemas', () => {
  it('passes a valid body through as the schema parsed it', () => {
    const checked = validate(LoginRequestSchema, {
      username: 'owner',
      password: 'correct-horse-battery',
    });
    expect(checked).toEqual({
      ok: true,
      value: { username: 'owner', password: 'correct-horse-battery' },
    });
  });

  it('puts each rejection on the dotted path of its field, nested rows included', () => {
    const checked = validate(
      CreateProviderSchema,
      providerInput({
        ...EMPTY_PROVIDER_DRAFT,
        name: 'Hosted',
        base_url: 'not a url',
        api_key: 'k',
        max_parallel_requests: 'many',
      }),
    );
    expect(checked.ok).toBe(false);
    if (checked.ok) return;
    expect(Object.keys(checked.errors).sort()).toEqual([
      'base_url',
      'max_parallel_requests',
      'models.0.model_id',
    ]);
  });

  it('keeps the first message of a path, as the server lists them', () => {
    expect(
      errorsFromIssues([
        { path: 'name', message: 'Too short' },
        { path: 'name', message: 'Not allowed' },
        { path: '', message: 'Validation failed' },
      ]),
    ).toEqual({ name: 'Too short', '': 'Validation failed' });
  });
});

describe('field values', () => {
  it('leaves an empty optional text out and clears a nullable one', () => {
    expect(optionalText('  hello ')).toBe('hello');
    expect(optionalText('   ')).toBeUndefined();
    expect(nullableText('')).toBeNull();
  });

  it('reads numbers, keeping text that is not one for the schema to reject', () => {
    expect(numberOrNull(' 42.5 ')).toBe(42.5);
    expect(numberOrNull('')).toBeNull();
    expect(numberOrNull('lots')).toBe('lots');
    expect(optionalNumber('')).toBeUndefined();
    expect(numberText(null)).toBe('');
    expect(numberText(8)).toBe('8');
  });

  it('round-trips an instant through a datetime-local value', () => {
    const iso = '2026-10-02T09:30:00.000Z';
    expect(isoOfLocalInput(localInputOf(iso))).toBe(iso);
    expect(localInputOf(null)).toBe('');
    expect(isoOfLocalInput('')).toBeNull();
    expect(isoOfLocalInput('yesterday')).toBe('yesterday');
  });
});
