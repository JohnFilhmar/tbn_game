import { Controller, Delete, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  BranchReviewListQuerySchema,
  CreateRepositorySchema,
  IdSchema,
  MergeRequestListQuerySchema,
  type BranchReview,
  type BranchReviewListQuery,
  type CreateRepository,
  type MergeRequest,
  type MergeRequestListQuery,
  type Repository,
} from '@tbn/contracts';
import type { AuthenticatedOwner } from '@/lib/auth/authenticated_owner';
import { CurrentOwner } from '@/lib/auth/current_owner.decorator';
import { ZodBody, ZodParam, ZodQuery } from '@/lib/validation/zod.decorator';
import {
  GitRecordsService,
  to_branch_review_view,
  to_merge_request_view,
} from '@/modules/company/services/git_records.service';
import { GitRepositoryService } from '@/modules/runtime/services/git/git_repository.service';

/** Repositories the owner registered. */
@Controller('repositories')
export class RepositoryController {
  constructor(private readonly repositories: GitRepositoryService) {}

  @Get()
  list(@CurrentOwner() owner: AuthenticatedOwner): Promise<Repository[]> {
    return this.repositories.list(owner.id);
  }

  @Post()
  create(
    @CurrentOwner() owner: AuthenticatedOwner,
    @ZodBody(CreateRepositorySchema) body: CreateRepository,
  ): Promise<Repository> {
    return this.repositories.register(owner.id, body);
  }

  @Get(':id')
  get(
    @CurrentOwner() owner: AuthenticatedOwner,
    @ZodParam('id', IdSchema) id: string,
  ): Promise<Repository> {
    return this.repositories.get(owner.id, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(
    @CurrentOwner() owner: AuthenticatedOwner,
    @ZodParam('id', IdSchema) id: string,
  ): Promise<void> {
    return this.repositories.delete(owner.id, id);
  }

  /** Fetches the default branch from the remote again. */
  @Post(':id/fetch')
  @HttpCode(HttpStatus.OK)
  fetch(
    @CurrentOwner() owner: AuthenticatedOwner,
    @ZodParam('id', IdSchema) id: string,
  ): Promise<Repository> {
    return this.repositories.fetch(owner.id, id);
  }
}

/** Merge requests managers opened; the owner merges or closes them. */
@Controller('merge_requests')
export class MergeRequestController {
  constructor(
    private readonly records: GitRecordsService,
    private readonly repositories: GitRepositoryService,
  ) {}

  @Get()
  async list(
    @CurrentOwner() owner: AuthenticatedOwner,
    @ZodQuery(MergeRequestListQuerySchema) query: MergeRequestListQuery,
  ): Promise<MergeRequest[]> {
    return (await this.records.list_merge_requests(owner.id, query)).map(to_merge_request_view);
  }

  @Get(':id')
  async get(
    @CurrentOwner() owner: AuthenticatedOwner,
    @ZodParam('id', IdSchema) id: string,
  ): Promise<MergeRequest> {
    return to_merge_request_view(await this.records.require_merge_request(owner.id, id));
  }

  /** Merges into `development`. The only writer of that branch. */
  @Post(':id/merge')
  @HttpCode(HttpStatus.OK)
  merge(
    @CurrentOwner() owner: AuthenticatedOwner,
    @ZodParam('id', IdSchema) id: string,
  ): Promise<MergeRequest> {
    return this.repositories.merge(owner.id, id);
  }

  @Post(':id/close')
  @HttpCode(HttpStatus.OK)
  close(
    @CurrentOwner() owner: AuthenticatedOwner,
    @ZodParam('id', IdSchema) id: string,
  ): Promise<MergeRequest> {
    return this.repositories.close(owner.id, id);
  }
}

/** Reviews managers recorded on their interns' branches. */
@Controller('branch_reviews')
export class BranchReviewController {
  constructor(private readonly records: GitRecordsService) {}

  @Get()
  async list(
    @CurrentOwner() owner: AuthenticatedOwner,
    @ZodQuery(BranchReviewListQuerySchema) query: BranchReviewListQuery,
  ): Promise<BranchReview[]> {
    return (await this.records.list_reviews(owner.id, query)).map(to_branch_review_view);
  }
}
