import { Injectable } from '@nestjs/common';
import type { BranchReviewListQuery, MergeRequestListQuery } from '@tbn/contracts';
import { PrismaService } from '@/lib/database/prisma.service';
import type {
  BranchReviewRecord,
  BranchReviewWrite,
  MergeRequestRecord,
  MergeRequestWrite,
  RepositoryRecord,
  RepositoryWrite,
} from '@/modules/company/types/git_records';
import type {
  BranchReviewRepository,
  MergeRequestRepository,
  RepositoryRepository,
} from './interface/git_repositories.interface';

const LIST_LIMIT = 200;

/** `RepositoryRepository` on Prisma. */
@Injectable()
export class PrismaRepositoryRepository implements RepositoryRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(owner_id: string): Promise<RepositoryRecord[]> {
    return this.prisma.repository.findMany({ where: { owner_id }, orderBy: { name: 'asc' } });
  }

  find(owner_id: string, id: string): Promise<RepositoryRecord | null> {
    return this.prisma.repository.findFirst({ where: { id, owner_id } });
  }

  find_by_name(owner_id: string, name: string): Promise<RepositoryRecord | null> {
    return this.prisma.repository.findFirst({ where: { owner_id, name } });
  }

  create(owner_id: string, write: RepositoryWrite): Promise<RepositoryRecord> {
    return this.prisma.repository.create({ data: { owner_id, ...write } });
  }

  async delete(owner_id: string, id: string): Promise<boolean> {
    const result = await this.prisma.repository.deleteMany({ where: { id, owner_id } });
    return result.count > 0;
  }
}

/** `MergeRequestRepository` on Prisma. */
@Injectable()
export class PrismaMergeRequestRepository implements MergeRequestRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(owner_id: string, query: MergeRequestListQuery): Promise<MergeRequestRecord[]> {
    return this.prisma.mergeRequest.findMany({
      where: {
        owner_id,
        ...(query.status !== undefined && { status: query.status }),
        ...(query.repository_id !== undefined && { repository_id: query.repository_id }),
      },
      orderBy: { created_at: 'desc' },
      take: LIST_LIMIT,
    });
  }

  find(owner_id: string, id: string): Promise<MergeRequestRecord | null> {
    return this.prisma.mergeRequest.findFirst({ where: { id, owner_id } });
  }

  find_open(
    owner_id: string,
    repository_id: string,
    source_branch: string,
  ): Promise<MergeRequestRecord | null> {
    return this.prisma.mergeRequest.findFirst({
      where: { owner_id, repository_id, source_branch, status: 'open' },
    });
  }

  create(owner_id: string, write: MergeRequestWrite): Promise<MergeRequestRecord> {
    return this.prisma.mergeRequest.create({ data: { owner_id, ...write } });
  }

  async mark_merged(
    owner_id: string,
    id: string,
    merge_sha: string,
  ): Promise<MergeRequestRecord | null> {
    const result = await this.prisma.mergeRequest.updateMany({
      where: { id, owner_id, status: 'open' },
      data: { status: 'merged', merge_sha, merged_at: new Date() },
    });
    return result.count === 0 ? null : this.find(owner_id, id);
  }

  async close(owner_id: string, id: string): Promise<MergeRequestRecord | null> {
    const result = await this.prisma.mergeRequest.updateMany({
      where: { id, owner_id, status: 'open' },
      data: { status: 'closed', closed_at: new Date() },
    });
    return result.count === 0 ? null : this.find(owner_id, id);
  }
}

/** `BranchReviewRepository` on Prisma. */
@Injectable()
export class PrismaBranchReviewRepository implements BranchReviewRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(owner_id: string, query: BranchReviewListQuery): Promise<BranchReviewRecord[]> {
    return this.prisma.branchReview.findMany({
      where: {
        owner_id,
        ...(query.repository_id !== undefined && { repository_id: query.repository_id }),
        ...(query.branch !== undefined && { branch: query.branch }),
      },
      orderBy: { created_at: 'desc' },
      take: LIST_LIMIT,
    });
  }

  find(owner_id: string, id: string): Promise<BranchReviewRecord | null> {
    return this.prisma.branchReview.findFirst({ where: { owner_id, id } });
  }

  latest(
    owner_id: string,
    repository_id: string,
    branch: string,
  ): Promise<BranchReviewRecord | null> {
    return this.prisma.branchReview.findFirst({
      where: { owner_id, repository_id, branch },
      orderBy: { created_at: 'desc' },
    });
  }

  create(owner_id: string, write: BranchReviewWrite): Promise<BranchReviewRecord> {
    return this.prisma.branchReview.create({ data: { owner_id, ...write } });
  }
}
