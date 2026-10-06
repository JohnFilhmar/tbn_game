import {
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import {
  LoginRequestSchema,
  type LoginRequest,
  type Principal,
  type Session,
} from '@tbn/contracts';
import type { AuthenticatedRequest } from '@/lib/auth/authenticated_owner';
import { Public } from '@/lib/auth/public.decorator';
import { ZodBody } from '@/lib/validation/zod.decorator';
import { AuthService } from '@/modules/identity/services/auth.service';

/** Owner login and session. */
@Controller('auth')
export class AuthController {
  constructor(private readonly auth_service: AuthService) {}

  /** Exchanges the owner's credentials for a session token. */
  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@ZodBody(LoginRequestSchema) body: LoginRequest): Promise<Session> {
    const session = await this.auth_service.login(body.username, body.password);
    if (session === null) throw new UnauthorizedException('Invalid credentials');
    return session;
  }

  /** Forgets the current session. */
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Headers('authorization') authorization: string | undefined): Promise<void> {
    const token = (authorization ?? '').replace(/^Bearer\s+/i, '').trim();
    await this.auth_service.logout(token);
  }

  /** Who is signed in: the owner, or a guest and whose company they visit. */
  @Get('me')
  me(@Req() request: AuthenticatedRequest): Principal {
    if (request.guest !== undefined) {
      const { id, name, owner_username } = request.guest;
      return { kind: 'guest', id, name, owner_username };
    }
    if (request.owner === undefined) throw new UnauthorizedException();
    return { kind: 'owner', id: request.owner.id, username: request.owner.username };
  }
}
