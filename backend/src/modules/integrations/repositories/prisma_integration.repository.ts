import { Injectable } from '@nestjs/common';
import { IntegrationPlaceholderSchema, type ProcessType } from '@tbn/contracts';
import { z } from 'zod';
import { PrismaService } from '@/lib/database/prisma.service';
import type {
  IntegrationAttachmentRecord,
  IntegrationRecord,
  IntegrationWrite,
  PluginAttachmentRecord,
  PluginRecord,
  PluginWrite,
  ProcessInstanceRecord,
} from '@/modules/integrations/types/integration_records';
import type {
  IntegrationRepository,
  PluginRepository,
  ProcessInstanceRepository,
} from './interface/integration_repository.interface';

const HeadersSchema = z.record(z.string(), z.string());
const PlaceholdersSchema = z.array(IntegrationPlaceholderSchema);

/** The JSON columns of an integration write, as Prisma takes them. */
function json_columns(write: Partial<IntegrationWrite>): {
  headers?: Record<string, string>;
  placeholders?: z.infer<typeof PlaceholdersSchema>;
} {
  return {
    ...(write.headers !== undefined && { headers: HeadersSchema.parse(write.headers) }),
    ...(write.placeholders !== undefined && {
      placeholders: PlaceholdersSchema.parse(write.placeholders),
    }),
  };
}

/** `IntegrationRepository` on Prisma. */
@Injectable()
export class PrismaIntegrationRepository implements IntegrationRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(owner_id: string): Promise<IntegrationRecord[]> {
    return this.prisma.integration.findMany({ where: { owner_id }, orderBy: { name: 'asc' } });
  }

  find(owner_id: string, id: string): Promise<IntegrationRecord | null> {
    return this.prisma.integration.findFirst({ where: { id, owner_id } });
  }

  find_by_name(owner_id: string, name: string): Promise<IntegrationRecord | null> {
    return this.prisma.integration.findFirst({ where: { owner_id, name } });
  }

  create(owner_id: string, write: IntegrationWrite): Promise<IntegrationRecord> {
    return this.prisma.integration.create({
      data: { owner_id, ...write, ...json_columns(write) },
    });
  }

  async update(
    owner_id: string,
    id: string,
    write: Partial<IntegrationWrite>,
  ): Promise<IntegrationRecord | null> {
    const result = await this.prisma.integration.updateMany({
      where: { id, owner_id },
      data: { ...write, ...json_columns(write) },
    });
    return result.count === 0 ? null : this.find(owner_id, id);
  }

  async delete(owner_id: string, id: string): Promise<boolean> {
    const result = await this.prisma.integration.deleteMany({ where: { id, owner_id } });
    return result.count > 0;
  }

  attach(
    owner_id: string,
    integration_id: string,
    agent_id: string,
  ): Promise<IntegrationAttachmentRecord> {
    return this.prisma.integrationAttachment.upsert({
      where: { integration_id_agent_id: { integration_id, agent_id } },
      create: { owner_id, integration_id, agent_id },
      update: {},
    });
  }

  async detach(owner_id: string, integration_id: string, agent_id: string): Promise<boolean> {
    const result = await this.prisma.integrationAttachment.deleteMany({
      where: { owner_id, integration_id, agent_id },
    });
    return result.count > 0;
  }

  async list_for_agent(owner_id: string, agent_id: string): Promise<IntegrationRecord[]> {
    const rows = await this.prisma.integrationAttachment.findMany({
      where: { owner_id, agent_id },
      include: { integration: true },
    });
    return rows.map((row) => row.integration).sort((a, b) => a.name.localeCompare(b.name));
  }
}

/** `PluginRepository` on Prisma. */
@Injectable()
export class PrismaPluginRepository implements PluginRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(owner_id: string): Promise<PluginRecord[]> {
    return this.prisma.plugin.findMany({ where: { owner_id }, orderBy: { name: 'asc' } });
  }

  find(owner_id: string, id: string): Promise<PluginRecord | null> {
    return this.prisma.plugin.findFirst({ where: { id, owner_id } });
  }

  find_by_name(owner_id: string, name: string): Promise<PluginRecord | null> {
    return this.prisma.plugin.findFirst({ where: { owner_id, name } });
  }

  create(owner_id: string, write: PluginWrite): Promise<PluginRecord> {
    return this.prisma.plugin.create({ data: { owner_id, ...write } });
  }

  async update(
    owner_id: string,
    id: string,
    write: Partial<PluginWrite>,
  ): Promise<PluginRecord | null> {
    const result = await this.prisma.plugin.updateMany({ where: { id, owner_id }, data: write });
    return result.count === 0 ? null : this.find(owner_id, id);
  }

  async delete(owner_id: string, id: string): Promise<boolean> {
    const result = await this.prisma.plugin.deleteMany({ where: { id, owner_id } });
    return result.count > 0;
  }

  attach(owner_id: string, plugin_id: string, agent_id: string): Promise<PluginAttachmentRecord> {
    return this.prisma.pluginAttachment.upsert({
      where: { plugin_id_agent_id: { plugin_id, agent_id } },
      create: { owner_id, plugin_id, agent_id },
      update: {},
    });
  }

  async detach(owner_id: string, plugin_id: string, agent_id: string): Promise<boolean> {
    const result = await this.prisma.pluginAttachment.deleteMany({
      where: { owner_id, plugin_id, agent_id },
    });
    return result.count > 0;
  }

  async list_for_agent(owner_id: string, agent_id: string): Promise<PluginRecord[]> {
    const rows = await this.prisma.pluginAttachment.findMany({
      where: { owner_id, agent_id, plugin: { enabled: true } },
      include: { plugin: true },
    });
    return rows.map((row) => row.plugin).sort((a, b) => a.name.localeCompare(b.name));
  }
}

/** `ProcessInstanceRepository` on Prisma. */
@Injectable()
export class PrismaProcessInstanceRepository implements ProcessInstanceRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(process_type: ProcessType, instance_id: string): Promise<ProcessInstanceRecord> {
    return this.prisma.processInstance.create({ data: { process_type, instance_id } });
  }

  find_unstopped(process_type: ProcessType): Promise<ProcessInstanceRecord[]> {
    return this.prisma.processInstance.findMany({
      where: { process_type, stopped_at: null },
      orderBy: { started_at: 'asc' },
    });
  }

  async mark_stopped(ids: string[], at: Date): Promise<void> {
    if (ids.length === 0) return;
    await this.prisma.processInstance.updateMany({
      where: { id: { in: ids }, stopped_at: null },
      data: { stopped_at: at },
    });
  }
}
