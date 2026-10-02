import { Module } from '@nestjs/common';
import { CryptoModule } from '@/lib/crypto/crypto.module';
import { DatabaseModule } from '@/lib/database/database.module';
import { AnthropicMessagesAdapter } from './adapters/anthropic_messages.adapter';
import { OpenAiChatCompletionsAdapter } from './adapters/openai_chat_completions.adapter';
import { ProviderController } from './controllers/provider.controller';
import { SearchProviderController } from './controllers/search_provider.controller';
import { CAP_WINDOW_REPOSITORY } from './repositories/interface/cap_window_repository.interface';
import { PROVIDER_REPOSITORY } from './repositories/interface/provider_repository.interface';
import { SEARCH_PROVIDER_REPOSITORY } from './repositories/interface/search_provider_repository.interface';
import { USAGE_REPOSITORY } from './repositories/interface/usage_repository.interface';
import { PrismaCapWindowRepository } from './repositories/prisma_cap_window.repository';
import { PrismaProviderRepository } from './repositories/prisma_provider.repository';
import { PrismaSearchProviderRepository } from './repositories/prisma_search_provider.repository';
import { PrismaUsageRepository } from './repositories/prisma_usage.repository';
import { CapService } from './services/caps/cap.service';
import { ProviderClientService } from './services/provider_client.service';
import { ProviderService } from './services/provider.service';
import { SearchProviderService } from './services/search/search_provider.service';

/**
 * Providers, their keys and state, the two adapters, usage counting and the cap windows on each
 * key, and the search providers with their keys. Split from the run loop so the company module
 * can validate an agent's provider without depending on the loop. It reads no preferences:
 * callers pass the owner's threshold defaults.
 */
@Module({
  imports: [DatabaseModule, CryptoModule],
  controllers: [ProviderController, SearchProviderController],
  providers: [
    { provide: PROVIDER_REPOSITORY, useClass: PrismaProviderRepository },
    { provide: SEARCH_PROVIDER_REPOSITORY, useClass: PrismaSearchProviderRepository },
    { provide: USAGE_REPOSITORY, useClass: PrismaUsageRepository },
    { provide: CAP_WINDOW_REPOSITORY, useClass: PrismaCapWindowRepository },
    AnthropicMessagesAdapter,
    OpenAiChatCompletionsAdapter,
    ProviderService,
    SearchProviderService,
    ProviderClientService,
    CapService,
  ],
  exports: [
    ProviderService,
    SearchProviderService,
    ProviderClientService,
    CapService,
    USAGE_REPOSITORY,
  ],
})
export class RuntimeProvidersModule {}
