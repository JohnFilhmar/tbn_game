import { Controller, Get, Param, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Public } from '@/lib/auth/public.decorator';
import { read_cookie } from '@/lib/http/cookies';
import { CLIENT_PATH } from '@/lib/http/serve_client';
import {
  GUEST_COOKIE,
  GuestSessionService,
} from '@/modules/identity/services/guest_session.service';

const EXPIRED_LINK = 'This invite link has expired or was already used. Ask for a new one.';

/**
 * The two routes the reverse proxy reaches without the owner's gate: an invite link, and the
 * check the proxy asks before letting a guest's request through.
 */
@Public()
@Controller()
export class InviteController {
  constructor(private readonly sessions: GuestSessionService) {}

  /** Follows an invite link: sets the guest cookie and opens the world, once per link. */
  @Get('invite/:token')
  async redeem(@Param('token') token: string, @Res() response: Response): Promise<void> {
    const session = await this.sessions.redeem(token);
    if (session === null) {
      response.status(410).type('text/plain').send(EXPIRED_LINK);
      return;
    }
    // Lax, not Strict: the link is opened from a chat app, and the redirect that follows must
    // carry the cookie.
    response.cookie(GUEST_COOKIE, session.token, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      expires: session.expires_at,
    });
    response.redirect(302, `${CLIENT_PATH}/`);
  }

  /** 204 when the request carries a live guest session, 401 otherwise. Asked by the proxy. */
  @Get('gate')
  async gate(@Req() request: Request, @Res() response: Response): Promise<void> {
    const token = read_cookie(request.headers.cookie, GUEST_COOKIE);
    const guest = token === null ? null : await this.sessions.authenticate(token);
    response.status(guest === null ? 401 : 204).end();
  }
}
