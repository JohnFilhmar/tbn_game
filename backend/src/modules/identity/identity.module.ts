import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { DatabaseModule } from '@/lib/database/database.module';
import { AuthController } from './controllers/auth.controller';
import { AuthGuard } from './guards/auth.guard';
import { OWNER_REPOSITORY } from './repositories/interface/owner_repository.interface';
import { SESSION_REPOSITORY } from './repositories/interface/session_repository.interface';
import { PrismaOwnerRepository } from './repositories/prisma_owner.repository';
import { PrismaSessionRepository } from './repositories/prisma_session.repository';
import { AuthService } from './services/auth.service';
import { OwnerService } from './services/owner.service';
import { PasswordService } from './services/password.service';

/** Owner login and session. Registers the global auth guard. */
@Module({
  imports: [DatabaseModule],
  controllers: [AuthController],
  providers: [
    { provide: OWNER_REPOSITORY, useClass: PrismaOwnerRepository },
    { provide: SESSION_REPOSITORY, useClass: PrismaSessionRepository },
    PasswordService,
    OwnerService,
    AuthService,
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
  exports: [OwnerService, AuthService],
})
export class IdentityModule {}
