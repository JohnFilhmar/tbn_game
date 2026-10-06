import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { DatabaseModule } from '@/lib/database/database.module';
import { AuthController } from './controllers/auth.controller';
import { GuestController } from './controllers/guest.controller';
import { InviteController } from './controllers/invite.controller';
import { PlayerMessageController } from './controllers/player_message.controller';
import { AuthGuard } from './guards/auth.guard';
import { GUEST_REPOSITORY } from './repositories/interface/guest_repository.interface';
import { OWNER_REPOSITORY } from './repositories/interface/owner_repository.interface';
import { SESSION_REPOSITORY } from './repositories/interface/session_repository.interface';
import { PrismaGuestRepository } from './repositories/prisma_guest.repository';
import { PLAYER_MESSAGE_REPOSITORY } from './repositories/interface/player_message_repository.interface';
import { PrismaOwnerRepository } from './repositories/prisma_owner.repository';
import { PrismaPlayerMessageRepository } from './repositories/prisma_player_message.repository';
import { PrismaSessionRepository } from './repositories/prisma_session.repository';
import { AuthService } from './services/auth.service';
import { GuestService } from './services/guest.service';
import { GuestSessionService } from './services/guest_session.service';
import { OwnerService } from './services/owner.service';
import { PasswordService } from './services/password.service';
import { PlayerMessageService } from './services/player_message.service';

/**
 * The players of the owner's world: the owner's login and session, guests and their invites, and
 * the messages between players. Registers the global auth guard.
 */
@Module({
  imports: [DatabaseModule],
  controllers: [AuthController, GuestController, InviteController, PlayerMessageController],
  providers: [
    { provide: OWNER_REPOSITORY, useClass: PrismaOwnerRepository },
    { provide: SESSION_REPOSITORY, useClass: PrismaSessionRepository },
    { provide: GUEST_REPOSITORY, useClass: PrismaGuestRepository },
    { provide: PLAYER_MESSAGE_REPOSITORY, useClass: PrismaPlayerMessageRepository },
    PasswordService,
    OwnerService,
    AuthService,
    GuestSessionService,
    GuestService,
    PlayerMessageService,
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
  exports: [OwnerService, AuthService, GuestSessionService, GuestService, PlayerMessageService],
})
export class IdentityModule {}
