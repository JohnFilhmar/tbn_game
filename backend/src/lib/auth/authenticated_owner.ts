import type { Request } from 'express';

/** The owner behind an authenticated request. */
export interface AuthenticatedOwner {
  id: string;
  username: string;
}

/** A guest behind an authenticated request: one of the owner's invited friends. */
export interface AuthenticatedGuest {
  id: string;
  owner_id: string;
  /** Null until the guest picks a name on the first visit. */
  name: string | null;
  owner_username: string;
}

/**
 * An Express request after the auth guard ran. `owner` is the owner whose data the request reads:
 * the signed-in owner, or the host of a signed-in guest, who also sets `guest`.
 */
export interface AuthenticatedRequest extends Request {
  owner?: AuthenticatedOwner;
  guest?: AuthenticatedGuest;
}
