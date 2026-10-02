import type { Request } from 'express';

/** The owner behind an authenticated request. */
export interface AuthenticatedOwner {
  id: string;
  username: string;
}

/** An Express request after the auth guard attached its owner. */
export interface AuthenticatedRequest extends Request {
  owner?: AuthenticatedOwner;
}
