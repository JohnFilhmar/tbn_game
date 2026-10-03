import { CompanyModule } from './company/company.module';
import { EventsModule } from './events/events.module';
import { IdentityModule } from './identity/identity.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { KnowledgeModule } from './knowledge/knowledge.module';
import { RuntimeModule } from './runtime/runtime.module';
import { WorldModule } from './world/world.module';

/**
 * The domain modules of the monolith. Both process types load all of them. A module talks to
 * another only through its exported service and never reads another module's tables.
 */
export const DOMAIN_MODULES = [
  IdentityModule,
  CompanyModule,
  RuntimeModule,
  KnowledgeModule,
  IntegrationsModule,
  WorldModule,
  EventsModule,
];
