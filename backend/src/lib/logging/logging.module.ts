import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { APP_CONFIG, PROCESS_TYPE } from '@/config/config.tokens';
import { LOG_DESTINATION, LogDestinationModule } from './log_destination';
import { build_logger_options } from './logger_options';

/** Structured JSON logging for both process types. */
@Module({
  imports: [
    LoggerModule.forRootAsync({
      imports: [LogDestinationModule],
      inject: [APP_CONFIG, PROCESS_TYPE, LOG_DESTINATION],
      useFactory: build_logger_options,
    }),
  ],
})
export class LoggingModule {}
