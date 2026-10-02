import { Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApprovalListQuerySchema,
  DecideApprovalSchema,
  IdSchema,
  type Approval,
  type ApprovalListQuery,
  type DecideApproval,
} from '@tbn/contracts';
import type { AuthenticatedOwner } from '@/lib/auth/authenticated_owner';
import { CurrentOwner } from '@/lib/auth/current_owner.decorator';
import { ZodBody, ZodParam, ZodQuery } from '@/lib/validation/zod.decorator';
import { ApprovalService } from '@/modules/runtime/services/approvals/approval.service';

/** The approval inbox: what waits for the owner, and the decisions. */
@Controller('approvals')
export class ApprovalController {
  constructor(private readonly approvals: ApprovalService) {}

  @Get()
  list(
    @CurrentOwner() owner: AuthenticatedOwner,
    @ZodQuery(ApprovalListQuerySchema) query: ApprovalListQuery,
  ): Promise<Approval[]> {
    return this.approvals.list(owner.id, query);
  }

  @Get(':id')
  get(
    @CurrentOwner() owner: AuthenticatedOwner,
    @ZodParam('id', IdSchema) id: string,
  ): Promise<Approval> {
    return this.approvals.get(owner.id, id);
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  approve(
    @CurrentOwner() owner: AuthenticatedOwner,
    @ZodParam('id', IdSchema) id: string,
    @ZodBody(DecideApprovalSchema.optional()) body: DecideApproval | undefined,
  ): Promise<Approval> {
    return this.approvals.approve(owner.id, id, body?.note ?? null);
  }

  @Post(':id/deny')
  @HttpCode(HttpStatus.OK)
  deny(
    @CurrentOwner() owner: AuthenticatedOwner,
    @ZodParam('id', IdSchema) id: string,
    @ZodBody(DecideApprovalSchema.optional()) body: DecideApproval | undefined,
  ): Promise<Approval> {
    return this.approvals.deny(owner.id, id, body?.note ?? null);
  }
}
