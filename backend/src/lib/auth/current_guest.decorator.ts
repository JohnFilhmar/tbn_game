import { ForbiddenException, createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AuthenticatedGuest, AuthenticatedRequest } from './authenticated_owner';

/** Injects the `AuthenticatedGuest` behind the request, refusing the owner with 403. */
export const CurrentGuest = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedGuest => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (request.guest === undefined) throw new ForbiddenException('Only a guest can do this');
    return request.guest;
  },
);
