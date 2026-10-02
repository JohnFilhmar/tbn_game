import { SetMetadata, type CustomDecorator } from '@nestjs/common';

/** Metadata key the auth guard reads to skip a route or controller. */
export const IS_PUBLIC_KEY = 'is_public';

/** Marks a route or controller as reachable without a session token. */
export function Public(): CustomDecorator<string> {
  return SetMetadata(IS_PUBLIC_KEY, true);
}
