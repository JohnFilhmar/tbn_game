import { Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/** Provides the Prisma client. Only repositories inside a module use it. */
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class DatabaseModule {}
