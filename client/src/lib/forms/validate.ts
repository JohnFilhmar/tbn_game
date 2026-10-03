import type { z } from 'zod';
import type { FieldIssue } from '@/lib/api/apiError';

/** The first reason each field was rejected, by its dotted path; `''` holds the form's own. */
export type FieldErrors = Record<string, string>;

/** A form's input, checked: the body to send, or why it cannot be sent. */
export type Validation<Body> = { ok: true; value: Body } | { ok: false; errors: FieldErrors };

/** Keeps the first message of each path, as the server and Zod list them. */
export function errorsFromIssues(issues: readonly FieldIssue[]): FieldErrors {
  const errors: FieldErrors = {};
  for (const issue of issues) {
    if (!(issue.path in errors)) errors[issue.path] = issue.message;
  }
  return errors;
}

/** Checks a form's input with the same contracts schema the route validates with. */
export function validate<Body>(schema: z.ZodType<Body>, input: unknown): Validation<Body> {
  const parsed = schema.safeParse(input);
  if (parsed.success) return { ok: true, value: parsed.data };
  return {
    ok: false,
    errors: errorsFromIssues(
      parsed.error.issues.map((issue) => ({
        path: issue.path.map(String).join('.'),
        message: issue.message,
      })),
    ),
  };
}
