import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from './zod_validation.pipe';

const schema = z.strictObject({ name: z.string().min(1), count: z.number().int() });

describe('ZodValidationPipe', () => {
  const pipe = new ZodValidationPipe(schema);

  it('returns the parsed value', () => {
    expect(pipe.transform({ name: 'a', count: 2 })).toEqual({ name: 'a', count: 2 });
  });

  it('throws a 400 with issue paths and no values', () => {
    expect.assertions(3);
    try {
      pipe.transform({ name: '', count: 1.5, extra: 'top-secret-value' });
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(BadRequestException);
      const body = JSON.stringify(error instanceof BadRequestException ? error.getResponse() : {});
      expect(body).toContain('"path":"name"');
      expect(body).not.toContain('top-secret-value');
    }
  });
});
