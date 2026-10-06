import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthenticatedRequest } from '@/lib/auth/authenticated_owner';
import { IS_GUEST_ALLOWED_KEY, IS_OWNER_ONLY_KEY } from '@/lib/auth/guest_policy.decorator';
import { IS_PUBLIC_KEY } from '@/lib/auth/public.decorator';
import { read_cookie } from '@/lib/http/cookies';
import { AuthService } from '@/modules/identity/services/auth.service';
import {
  GUEST_COOKIE,
  GuestSessionService,
} from '@/modules/identity/services/guest_session.service';

const BEARER_PREFIX = 'Bearer ';
const READ_METHODS = new Set(['GET', 'HEAD']);

/**
 * Global guard: every route needs a session unless it is marked `@Public()`. The owner signs in
 * with a Bearer token. A guest carries the `tbn_guest` cookie and may read any route that is not
 * `@OwnerOnly()`, but write only through routes marked `@GuestAllowed()`.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth_service: AuthService,
    private readonly guest_sessions: GuestSessionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, targets) === true) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.headers.authorization;
    if (typeof header === 'string' && header.startsWith(BEARER_PREFIX)) {
      const owner = await this.auth_service.authenticate(header.slice(BEARER_PREFIX.length).trim());
      if (owner === null) throw new UnauthorizedException('Invalid or expired session');
      request.owner = owner;
      return true;
    }

    const token = read_cookie(request.headers.cookie, GUEST_COOKIE);
    const guest = token === null ? null : await this.guest_sessions.authenticate(token);
    if (guest === null) throw new UnauthorizedException('Missing bearer token');
    const is_allowed = this.reflector.getAllAndOverride<boolean | undefined>(
      IS_GUEST_ALLOWED_KEY,
      targets,
    );
    const is_owner_only = this.reflector.getAllAndOverride<boolean | undefined>(
      IS_OWNER_ONLY_KEY,
      targets,
    );
    const may_read = READ_METHODS.has(request.method) && is_owner_only !== true;
    if (is_allowed !== true && !may_read) {
      throw new ForbiddenException('Guests can look but not change anything here');
    }
    request.owner = { id: guest.owner_id, username: guest.owner_username };
    request.guest = guest;
    return true;
  }
}
