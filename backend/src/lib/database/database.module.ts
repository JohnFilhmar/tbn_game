import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/**
 * Provides the Prisma client. Only repositories inside a module use it. Global so the health
 * service finds it in every process that has a database, and runs without it in the one that
 * does not, the egress proxy.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class DatabaseModule {}
