import { Body, Param, Query } from '@nestjs/common';
import type { ZodType } from 'zod';
import { ZodValidationPipe } from './zod_validation.pipe';

/** Validates the request body with `schema` and injects the parsed value. */
export function ZodBody<T>(schema: ZodType<T>): ParameterDecorator {
  return Body(new ZodValidationPipe(schema));
}

/** Validates one path parameter with `schema` and injects the parsed value. */
export function ZodParam<T>(name: string, schema: ZodType<T>): ParameterDecorator {
  return Param(name, new ZodValidationPipe(schema));
}

/** Validates the query string with `schema` and injects the parsed value. */
export function ZodQuery<T>(schema: ZodType<T>): ParameterDecorator {
  return Query(new ZodValidationPipe(schema));
}
