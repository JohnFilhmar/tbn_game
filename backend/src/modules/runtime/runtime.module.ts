import { Module } from '@nestjs/common';
import { RuntimeProvidersModule } from './runtime_providers.module';

/** Run loop, checkpoints, providers, usage caps, tools and caches. The loop arrives in phase 1a. */
@Module({
  imports: [RuntimeProvidersModule],
  exports: [RuntimeProvidersModule],
})
export class RuntimeModule {}
