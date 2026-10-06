import { SetMetadata, type CustomDecorator } from '@nestjs/common';

/** Metadata key for a route or controller guests may not read. */
export const IS_OWNER_ONLY_KEY = 'is_owner_only';

/** Metadata key for a write route guests may call. */
export const IS_GUEST_ALLOWED_KEY = 'is_guest_allowed';

/**
 * Keeps guests out of a route or a whole controller, reads included: for settings such as a
 * webhook address or a plugin header that work like secrets.
 */
export function OwnerOnly(): CustomDecorator<string> {
  return SetMetadata(IS_OWNER_ONLY_KEY, true);
}

/**
 * Lets guests call a write route. Guests may read any route that is not `@OwnerOnly()`, and may
 * write only through routes marked with this.
 */
export function GuestAllowed(): CustomDecorator<string> {
  return SetMetadata(IS_GUEST_ALLOWED_KEY, true);
}
