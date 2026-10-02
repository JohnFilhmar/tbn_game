import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { DatabaseModule } from '@/lib/database/database.module';
import { CommandStore } from './command_store';
import { IdempotencyInterceptor } from './idempotency.interceptor';

/**
 * Idempotent commands: the store of command ids and the global interceptor that applies it to
 * every authenticated `POST`, `PUT`, `PATCH` and `DELETE`.
 */
@Module({
  imports: [DatabaseModule],
  providers: [CommandStore, { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor }],
  exports: [CommandStore],
})
export class IdempotencyModule {}
