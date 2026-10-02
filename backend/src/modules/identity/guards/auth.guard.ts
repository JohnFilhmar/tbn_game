import {
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthenticatedRequest } from '@/lib/auth/authenticated_owner';
import { IS_PUBLIC_KEY } from '@/lib/auth/public.decorator';
import { AuthService } from '@/modules/identity/services/auth.service';

const BEARER_PREFIX = 'Bearer ';

/** Global guard: every route needs a live session token unless it is marked `@Public()`. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth_service: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const is_public = this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (is_public === true) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.headers.authorization;
    if (typeof header !== 'string' || !header.startsWith(BEARER_PREFIX)) {
      throw new UnauthorizedException('Missing bearer token');
    }
    const owner = await this.auth_service.authenticate(header.slice(BEARER_PREFIX.length).trim());
    if (owner === null) throw new UnauthorizedException('Invalid or expired session');
    request.owner = owner;
    return true;
  }
}
