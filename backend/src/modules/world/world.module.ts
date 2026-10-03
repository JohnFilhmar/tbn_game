import { Module } from '@nestjs/common';
import { DatabaseModule } from '@/lib/database/database.module';
import { WorldController } from './controllers/world.controller';
import { WORLD_LAYOUT_REPOSITORY } from './repositories/interface/world_layout_repository.interface';
import { WORLD_PROP_STATE_REPOSITORY } from './repositories/interface/world_prop_state_repository.interface';
import { PrismaWorldLayoutRepository } from './repositories/prisma_world_layout.repository';
import { PrismaWorldPropStateRepository } from './repositories/prisma_world_prop_state.repository';
import { WorldLayoutService } from './services/world_layout.service';
import { WorldPropStateService } from './services/world_prop_state.service';

/**
 * The world as the owner arranged it: each environment's theme, its props and their states. It
 * depends on nothing but the database; the events module reads it to send changes to every tab.
 */
@Module({
  imports: [DatabaseModule],
  controllers: [WorldController],
  providers: [
    { provide: WORLD_LAYOUT_REPOSITORY, useClass: PrismaWorldLayoutRepository },
    { provide: WORLD_PROP_STATE_REPOSITORY, useClass: PrismaWorldPropStateRepository },
    WorldLayoutService,
    WorldPropStateService,
  ],
  exports: [WorldLayoutService, WorldPropStateService],
})
export class WorldModule {}
