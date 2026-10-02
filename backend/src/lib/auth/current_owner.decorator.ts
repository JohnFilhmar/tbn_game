import { UnauthorizedException, createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AuthenticatedOwner, AuthenticatedRequest } from './authenticated_owner';

/** Injects the `AuthenticatedOwner` the guard attached to the request. */
export const CurrentOwner = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedOwner => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (request.owner === undefined) throw new UnauthorizedException();
    return request.owner;
  },
);
