import {
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { LoginRequestSchema, type LoginRequest, type Owner, type Session } from '@tbn/contracts';
import type { AuthenticatedOwner } from '@/lib/auth/authenticated_owner';
import { CurrentOwner } from '@/lib/auth/current_owner.decorator';
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

  /** The owner behind the current session. */
  @Get('me')
  me(@CurrentOwner() owner: AuthenticatedOwner): Pick<Owner, 'id' | 'username'> {
    return { id: owner.id, username: owner.username };
  }
}
