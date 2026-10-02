import { Module } from '@nestjs/common';
import { CryptoModule } from '@/lib/crypto/crypto.module';
import { DatabaseModule } from '@/lib/database/database.module';
import { AnthropicMessagesAdapter } from './adapters/anthropic_messages.adapter';
import { OpenAiChatCompletionsAdapter } from './adapters/openai_chat_completions.adapter';
import { ProviderController } from './controllers/provider.controller';
import { PROVIDER_REPOSITORY } from './repositories/interface/provider_repository.interface';
import { USAGE_REPOSITORY } from './repositories/interface/usage_repository.interface';
import { PrismaProviderRepository } from './repositories/prisma_provider.repository';
import { PrismaUsageRepository } from './repositories/prisma_usage.repository';
import { ProviderClientService } from './services/provider_client.service';
import { ProviderService } from './services/provider.service';

/**
 * Providers, their keys, the two adapters and usage counting. Split from the run loop so the
 * company module can validate an agent's provider without depending on the loop.
 */
@Module({
  imports: [DatabaseModule, CryptoModule],
  controllers: [ProviderController],
  providers: [
    { provide: PROVIDER_REPOSITORY, useClass: PrismaProviderRepository },
    { provide: USAGE_REPOSITORY, useClass: PrismaUsageRepository },
    AnthropicMessagesAdapter,
    OpenAiChatCompletionsAdapter,
    ProviderService,
    ProviderClientService,
  ],
  exports: [ProviderService, ProviderClientService],
})
export class RuntimeProvidersModule {}
