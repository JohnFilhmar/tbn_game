import { Prisma } from '@/generated/prisma/client';

const UNIQUE_VIOLATION = 'P2002';
const FOREIGN_KEY_VIOLATION = 'P2003';
const RECORD_NOT_FOUND = 'P2025';

function has_code(error: unknown, code: string): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
}

/** True when `error` is a unique constraint violation. */
export function is_unique_violation(error: unknown): boolean {
  return has_code(error, UNIQUE_VIOLATION);
}

/** True when `error` is a foreign key violation. */
export function is_foreign_key_violation(error: unknown): boolean {
  return has_code(error, FOREIGN_KEY_VIOLATION);
}

/** True when an update or delete found no row. */
export function is_record_not_found(error: unknown): boolean {
  return has_code(error, RECORD_NOT_FOUND);
}
