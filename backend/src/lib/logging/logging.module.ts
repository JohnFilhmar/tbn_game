import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { APP_CONFIG, PROCESS_TYPE } from '@/config/config.tokens';
import { build_logger_options } from './logger_options';

/** Structured JSON logging for both process types. */
@Module({
  imports: [
    LoggerModule.forRootAsync({
      inject: [APP_CONFIG, PROCESS_TYPE],
      useFactory: build_logger_options,
    }),
  ],
})
export class LoggingModule {}
