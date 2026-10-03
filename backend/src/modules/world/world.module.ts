import { Module } from '@nestjs/common';
import { DatabaseModule } from '@/lib/database/database.module';
import { WorldController } from './controllers/world.controller';
import { WORLD_LAYOUT_REPOSITORY } from './repositories/interface/world_layout_repository.interface';
import { PrismaWorldLayoutRepository } from './repositories/prisma_world_layout.repository';
import { WorldLayoutService } from './services/world_layout.service';

/**
 * The world as the owner arranged it: each environment's theme and props. It depends on nothing
 * but the database; the events module reads it to send layout changes to every open tab.
 */
@Module({
  imports: [DatabaseModule],
  controllers: [WorldController],
  providers: [
    { provide: WORLD_LAYOUT_REPOSITORY, useClass: PrismaWorldLayoutRepository },
    WorldLayoutService,
  ],
  exports: [WorldLayoutService],
})
export class WorldModule {}
