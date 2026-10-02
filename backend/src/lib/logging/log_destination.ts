import { Module } from '@nestjs/common';

/** Injection token for the stream log lines are written to. Tests replace it with a buffer. */
export const LOG_DESTINATION = Symbol('LOG_DESTINATION');

/** Provides the default log destination, stdout. */
@Module({
  providers: [{ provide: LOG_DESTINATION, useValue: process.stdout }],
  exports: [LOG_DESTINATION],
})
export class LogDestinationModule {}
