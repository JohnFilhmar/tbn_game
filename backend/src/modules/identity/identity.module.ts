import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { DatabaseModule } from '@/lib/database/database.module';
import { AuthController } from './controllers/auth.controller';
import { GuestController } from './controllers/guest.controller';
import { InviteController } from './controllers/invite.controller';
import { AuthGuard } from './guards/auth.guard';
import { GUEST_REPOSITORY } from './repositories/interface/guest_repository.interface';
import { OWNER_REPOSITORY } from './repositories/interface/owner_repository.interface';
import { SESSION_REPOSITORY } from './repositories/interface/session_repository.interface';
import { PrismaGuestRepository } from './repositories/prisma_guest.repository';
import { PrismaOwnerRepository } from './repositories/prisma_owner.repository';
import { PrismaSessionRepository } from './repositories/prisma_session.repository';
import { AuthService } from './services/auth.service';
import { GuestService } from './services/guest.service';
import { GuestSessionService } from './services/guest_session.service';
import { OwnerService } from './services/owner.service';
import { PasswordService } from './services/password.service';

/** Owner login and session, guests and their invites. Registers the global auth guard. */
@Module({
  imports: [DatabaseModule],
  controllers: [AuthController, GuestController, InviteController],
  providers: [
    { provide: OWNER_REPOSITORY, useClass: PrismaOwnerRepository },
    { provide: SESSION_REPOSITORY, useClass: PrismaSessionRepository },
    { provide: GUEST_REPOSITORY, useClass: PrismaGuestRepository },
    PasswordService,
    OwnerService,
    AuthService,
    GuestSessionService,
    GuestService,
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
  exports: [OwnerService, AuthService, GuestSessionService],
})
export class IdentityModule {}
