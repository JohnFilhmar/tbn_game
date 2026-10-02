import { BadRequestException, type PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';

/** One validation problem in a 400 response. Values are never echoed. */
export interface ValidationIssue {
  path: string;
  message: string;
}

/**
 * Validates one request part with a schema from `@tbn/contracts` and replaces it with the parsed
 * value. Schemas are strict objects, so unknown fields are rejected.
 */
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  /** Parses the value or throws a 400 with the list of issues. */
  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (result.success) return result.data;
    const issues: ValidationIssue[] = result.error.issues.map((issue) => ({
      path: issue.path.map(String).join('.'),
      message: issue.message,
    }));
    throw new BadRequestException({
      statusCode: 400,
      error: 'Bad Request',
      message: 'Validation failed',
      issues,
    });
  }
}
