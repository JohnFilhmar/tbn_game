import { Module } from '@nestjs/common';
import { CryptoModule } from '@/lib/crypto/crypto.module';
import { DatabaseModule } from '@/lib/database/database.module';
import { AnthropicMessagesAdapter } from './adapters/anthropic_messages.adapter';
import { OpenAiChatCompletionsAdapter } from './adapters/openai_chat_completions.adapter';
import { ProviderController } from './controllers/provider.controller';
import { CAP_WINDOW_REPOSITORY } from './repositories/interface/cap_window_repository.interface';
import { PROVIDER_REPOSITORY } from './repositories/interface/provider_repository.interface';
import { USAGE_REPOSITORY } from './repositories/interface/usage_repository.interface';
import { PrismaCapWindowRepository } from './repositories/prisma_cap_window.repository';
import { PrismaProviderRepository } from './repositories/prisma_provider.repository';
import { PrismaUsageRepository } from './repositories/prisma_usage.repository';
import { CapService } from './services/caps/cap.service';
import { ProviderClientService } from './services/provider_client.service';
import { ProviderService } from './services/provider.service';

/**
 * Providers, their keys and state, the two adapters, usage counting and the cap windows on each
 * key. Split from the run loop so the company module can validate an agent's provider without
 * depending on the loop. It reads no preferences: callers pass the owner's threshold defaults.
 */
@Module({
  imports: [DatabaseModule, CryptoModule],
  controllers: [ProviderController],
  providers: [
    { provide: PROVIDER_REPOSITORY, useClass: PrismaProviderRepository },
    { provide: USAGE_REPOSITORY, useClass: PrismaUsageRepository },
    { provide: CAP_WINDOW_REPOSITORY, useClass: PrismaCapWindowRepository },
    AnthropicMessagesAdapter,
    OpenAiChatCompletionsAdapter,
    ProviderService,
    ProviderClientService,
    CapService,
  ],
  exports: [ProviderService, ProviderClientService, CapService, USAGE_REPOSITORY],
})
export class RuntimeProvidersModule {}
