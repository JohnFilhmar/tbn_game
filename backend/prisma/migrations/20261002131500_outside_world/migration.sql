-- CreateEnum
CREATE TYPE "process_kind" AS ENUM ('web', 'worker', 'sandbox', 'egress_proxy');

-- CreateEnum
CREATE TYPE "sandbox_job_kind" AS ENUM ('agent', 'system');

-- CreateEnum
CREATE TYPE "sandbox_job_status" AS ENUM ('queued', 'running', 'done', 'failed', 'timed_out', 'lost');

-- CreateEnum
CREATE TYPE "search_provider_type" AS ENUM ('brave', 'searxng');

-- CreateEnum
CREATE TYPE "run_source_kind" AS ENUM ('fetch', 'search', 'library', 'plugin');

-- CreateEnum
CREATE TYPE "approval_kind" AS ENUM ('tool_call', 'runaway_guard');

-- CreateEnum
CREATE TYPE "approval_status" AS ENUM ('pending', 'approved', 'denied');

-- CreateEnum
CREATE TYPE "integration_method" AS ENUM ('GET', 'POST', 'PUT', 'PATCH', 'DELETE');

-- CreateEnum
CREATE TYPE "integration_body_format" AS ENUM ('json', 'form', 'text', 'none');

-- CreateEnum
CREATE TYPE "notification_event_type" AS ENUM ('process_restarted', 'runs_resumed', 'run_failed', 'cap_threshold_passed', 'provider_out_of_credit', 'backup_failed', 'disk_nearly_full', 'approval_waiting', 'report_finished');

-- CreateEnum
CREATE TYPE "notification_priority" AS ENUM ('normal', 'high');

-- CreateEnum
CREATE TYPE "notification_status" AS ENUM ('pending', 'sent', 'failed');

-- CreateEnum
CREATE TYPE "merge_request_status" AS ENUM ('open', 'merged', 'closed');

-- CreateEnum
CREATE TYPE "review_verdict" AS ENUM ('approve', 'request_changes');

-- AlterEnum
ALTER TYPE "run_pause_reason" ADD VALUE 'awaiting_approval';

-- AlterTable
ALTER TABLE "reports" ADD COLUMN     "search_vector" tsvector;

-- AlterTable
ALTER TABLE "runs" ADD COLUMN     "tainted_at" TIMESTAMPTZ(6);

-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "feature_branch" TEXT,
ADD COLUMN     "repository_id" TEXT;

-- CreateTable
CREATE TABLE "process_instances" (
    "id" TEXT NOT NULL,
    "process_type" "process_kind" NOT NULL,
    "instance_id" TEXT NOT NULL,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "stopped_at" TIMESTAMPTZ(6),

    CONSTRAINT "process_instances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sandbox_jobs" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "run_id" TEXT,
    "agent_id" TEXT,
    "kind" "sandbox_job_kind" NOT NULL,
    "status" "sandbox_job_status" NOT NULL DEFAULT 'queued',
    "spec" JSONB NOT NULL,
    "exit_code" INTEGER,
    "stdout" TEXT NOT NULL DEFAULT '',
    "stderr" TEXT NOT NULL DEFAULT '',
    "error" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMPTZ(6),
    "finished_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "sandbox_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "search_providers" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "type" "search_provider_type" NOT NULL,
    "name" TEXT NOT NULL,
    "base_url" TEXT NOT NULL,
    "api_key_ciphertext" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "price_per_thousand_requests" DOUBLE PRECISION,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "search_providers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "search_cache" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "provider_id" TEXT,
    "query_key" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "results" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "search_cache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fetch_cache" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "title" TEXT,
    "content_type" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "search_vector" tsvector,
    "fetched_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fetch_cache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cache_events" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "hits" INTEGER NOT NULL DEFAULT 0,
    "misses" INTEGER NOT NULL DEFAULT 0,
    "bytes_saved" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "cache_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "run_sources" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "kind" "run_source_kind" NOT NULL,
    "reference" TEXT NOT NULL,
    "cached" BOOLEAN NOT NULL DEFAULT false,
    "read_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "run_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approvals" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "agent_id" TEXT NOT NULL,
    "task_id" TEXT,
    "kind" "approval_kind" NOT NULL,
    "tool_name" TEXT,
    "tool_use_id" TEXT,
    "payload" JSONB NOT NULL,
    "preview" TEXT,
    "sources" JSONB NOT NULL DEFAULT '[]',
    "status" "approval_status" NOT NULL DEFAULT 'pending',
    "note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_at" TIMESTAMPTZ(6),

    CONSTRAINT "approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integrations" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "method" "integration_method" NOT NULL,
    "url" TEXT NOT NULL,
    "headers" JSONB NOT NULL DEFAULT '{}',
    "token_ciphertext" TEXT,
    "body_format" "integration_body_format" NOT NULL DEFAULT 'none',
    "body_template" TEXT,
    "placeholders" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "integrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_attachments" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "integration_id" TEXT NOT NULL,
    "agent_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "integration_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_channels" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "event_type" "notification_event_type" NOT NULL,
    "integration_id" TEXT NOT NULL,
    "body_template" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "notification_channels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "channel_id" TEXT,
    "integration_id" TEXT,
    "event_type" "notification_event_type" NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "priority" "notification_priority" NOT NULL DEFAULT 'normal',
    "status" "notification_status" NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "response_status" INTEGER,
    "error" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMPTZ(6),

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plugins" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "token_ciphertext" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "plugins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plugin_attachments" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "plugin_id" TEXT NOT NULL,
    "agent_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plugin_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "repositories" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "remote_url" TEXT,
    "default_branch" TEXT NOT NULL DEFAULT 'main',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "repositories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "merge_requests" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "repository_id" TEXT NOT NULL,
    "agent_id" TEXT NOT NULL,
    "source_branch" TEXT NOT NULL,
    "target_branch" TEXT NOT NULL,
    "status" "merge_request_status" NOT NULL DEFAULT 'open',
    "head_sha" TEXT NOT NULL,
    "diff" TEXT NOT NULL,
    "log" TEXT NOT NULL,
    "review_notes" TEXT NOT NULL,
    "test_output" TEXT,
    "test_job_id" TEXT,
    "merge_sha" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "merged_at" TIMESTAMPTZ(6),
    "closed_at" TIMESTAMPTZ(6),

    CONSTRAINT "merge_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branch_reviews" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "repository_id" TEXT NOT NULL,
    "reviewer_agent_id" TEXT NOT NULL,
    "branch" TEXT NOT NULL,
    "head_sha" TEXT NOT NULL,
    "findings" TEXT NOT NULL,
    "verdict" "review_verdict" NOT NULL,
    "test_job_id" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "branch_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "process_instances_process_type_stopped_at_idx" ON "process_instances"("process_type", "stopped_at");

-- CreateIndex
CREATE INDEX "sandbox_jobs_owner_id_run_id_idx" ON "sandbox_jobs"("owner_id", "run_id");

-- CreateIndex
CREATE INDEX "sandbox_jobs_status_started_at_idx" ON "sandbox_jobs"("status", "started_at");

-- CreateIndex
CREATE UNIQUE INDEX "search_providers_owner_id_name_key" ON "search_providers"("owner_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "search_cache_owner_id_query_key_key" ON "search_cache"("owner_id", "query_key");

-- CreateIndex
CREATE INDEX "fetch_cache_search_vector_idx" ON "fetch_cache" USING GIN ("search_vector");

-- CreateIndex
CREATE UNIQUE INDEX "fetch_cache_owner_id_url_key" ON "fetch_cache"("owner_id", "url");

-- CreateIndex
CREATE UNIQUE INDEX "cache_events_owner_id_kind_day_key" ON "cache_events"("owner_id", "kind", "day");

-- CreateIndex
CREATE INDEX "run_sources_owner_id_run_id_idx" ON "run_sources"("owner_id", "run_id");

-- CreateIndex
CREATE INDEX "approvals_owner_id_status_created_at_idx" ON "approvals"("owner_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "approvals_run_id_status_idx" ON "approvals"("run_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "integrations_owner_id_name_key" ON "integrations"("owner_id", "name");

-- CreateIndex
CREATE INDEX "integration_attachments_owner_id_agent_id_idx" ON "integration_attachments"("owner_id", "agent_id");

-- CreateIndex
CREATE UNIQUE INDEX "integration_attachments_integration_id_agent_id_key" ON "integration_attachments"("integration_id", "agent_id");

-- CreateIndex
CREATE INDEX "notification_channels_owner_id_event_type_idx" ON "notification_channels"("owner_id", "event_type");

-- CreateIndex
CREATE INDEX "notifications_owner_id_created_at_idx" ON "notifications"("owner_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "plugins_owner_id_name_key" ON "plugins"("owner_id", "name");

-- CreateIndex
CREATE INDEX "plugin_attachments_owner_id_agent_id_idx" ON "plugin_attachments"("owner_id", "agent_id");

-- CreateIndex
CREATE UNIQUE INDEX "plugin_attachments_plugin_id_agent_id_key" ON "plugin_attachments"("plugin_id", "agent_id");

-- CreateIndex
CREATE UNIQUE INDEX "repositories_owner_id_name_key" ON "repositories"("owner_id", "name");

-- CreateIndex
CREATE INDEX "merge_requests_owner_id_status_created_at_idx" ON "merge_requests"("owner_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "branch_reviews_owner_id_repository_id_branch_created_at_idx" ON "branch_reviews"("owner_id", "repository_id", "branch", "created_at");

-- CreateIndex
CREATE INDEX "reports_search_vector_idx" ON "reports" USING GIN ("search_vector");

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_repository_id_fkey" FOREIGN KEY ("repository_id") REFERENCES "repositories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sandbox_jobs" ADD CONSTRAINT "sandbox_jobs_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "owners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sandbox_jobs" ADD CONSTRAINT "sandbox_jobs_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sandbox_jobs" ADD CONSTRAINT "sandbox_jobs_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "search_providers" ADD CONSTRAINT "search_providers_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "owners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "search_cache" ADD CONSTRAINT "search_cache_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "owners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "search_cache" ADD CONSTRAINT "search_cache_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "search_providers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fetch_cache" ADD CONSTRAINT "fetch_cache_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "owners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cache_events" ADD CONSTRAINT "cache_events_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "owners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "run_sources" ADD CONSTRAINT "run_sources_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "owners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "run_sources" ADD CONSTRAINT "run_sources_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "owners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integrations" ADD CONSTRAINT "integrations_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "owners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_attachments" ADD CONSTRAINT "integration_attachments_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "owners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_attachments" ADD CONSTRAINT "integration_attachments_integration_id_fkey" FOREIGN KEY ("integration_id") REFERENCES "integrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_attachments" ADD CONSTRAINT "integration_attachments_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_channels" ADD CONSTRAINT "notification_channels_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "owners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_channels" ADD CONSTRAINT "notification_channels_integration_id_fkey" FOREIGN KEY ("integration_id") REFERENCES "integrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "owners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "notification_channels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_integration_id_fkey" FOREIGN KEY ("integration_id") REFERENCES "integrations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plugins" ADD CONSTRAINT "plugins_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "owners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plugin_attachments" ADD CONSTRAINT "plugin_attachments_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "owners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plugin_attachments" ADD CONSTRAINT "plugin_attachments_plugin_id_fkey" FOREIGN KEY ("plugin_id") REFERENCES "plugins"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plugin_attachments" ADD CONSTRAINT "plugin_attachments_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repositories" ADD CONSTRAINT "repositories_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "owners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merge_requests" ADD CONSTRAINT "merge_requests_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "owners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merge_requests" ADD CONSTRAINT "merge_requests_repository_id_fkey" FOREIGN KEY ("repository_id") REFERENCES "repositories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merge_requests" ADD CONSTRAINT "merge_requests_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_reviews" ADD CONSTRAINT "branch_reviews_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "owners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_reviews" ADD CONSTRAINT "branch_reviews_repository_id_fkey" FOREIGN KEY ("repository_id") REFERENCES "repositories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_reviews" ADD CONSTRAINT "branch_reviews_reviewer_agent_id_fkey" FOREIGN KEY ("reviewer_agent_id") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Reports written before this migration join the research library.
UPDATE "reports" SET "search_vector" = to_tsvector('english', "body_md") WHERE "search_vector" IS NULL;
