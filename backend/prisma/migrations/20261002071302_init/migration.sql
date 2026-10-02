-- CreateEnum
CREATE TYPE "api_format" AS ENUM ('anthropic_messages', 'openai_chat_completions');

-- CreateEnum
CREATE TYPE "cost_tier" AS ENUM ('cheap', 'standard', 'premium');

-- CreateEnum
CREATE TYPE "agent_status" AS ENUM ('idle', 'working', 'dismissed');

-- CreateEnum
CREATE TYPE "instruction_scope" AS ENUM ('global', 'role', 'agent');

-- CreateEnum
CREATE TYPE "skill_target_type" AS ENUM ('role', 'agent');

-- CreateEnum
CREATE TYPE "task_status" AS ENUM ('queued', 'in_progress', 'blocked', 'awaiting_approval', 'done', 'failed', 'cancelled');

-- CreateEnum
CREATE TYPE "run_status" AS ENUM ('running', 'done', 'failed', 'cancelled');

-- CreateEnum
CREATE TYPE "transcript_entry_kind" AS ENUM ('owner_message', 'task_assignment', 'assistant', 'tool_result', 'system_note');

-- CreateTable
CREATE TABLE "owners" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "owners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "last_seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "providers" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "api_format" "api_format" NOT NULL,
    "base_url" TEXT NOT NULL,
    "api_key_ciphertext" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "providers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_models" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "model_id" TEXT NOT NULL,
    "cost_tier" "cost_tier" NOT NULL,
    "input_price_per_million" DOUBLE PRECISION,
    "output_price_per_million" DOUBLE PRECISION,
    "cache_read_price_per_million" DOUBLE PRECISION,
    "cache_write_price_per_million" DOUBLE PRECISION,
    "max_output_tokens" INTEGER NOT NULL DEFAULT 8192,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "provider_models_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "departments" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "manager_agent_id" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agents" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "job_description" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "department_id" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "primary_model" TEXT NOT NULL,
    "intern_model" TEXT NOT NULL,
    "appearance" JSONB NOT NULL DEFAULT '{}',
    "tool_policy" JSONB NOT NULL DEFAULT '{}',
    "status" "agent_status" NOT NULL DEFAULT 'idle',
    "active_run_id" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "agents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "instructions" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "scope" "instruction_scope" NOT NULL,
    "role" TEXT,
    "agent_id" TEXT,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "instructions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skills" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "skills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skill_attachments" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "skill_id" TEXT NOT NULL,
    "target_type" "skill_target_type" NOT NULL,
    "role" TEXT,
    "agent_id" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "skill_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "preferences" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "instructions" TEXT NOT NULL,
    "assignee_agent_id" TEXT NOT NULL,
    "delegator_agent_id" TEXT,
    "parent_task_id" TEXT,
    "status" "task_status" NOT NULL DEFAULT 'queued',
    "result" TEXT,
    "started_at" TIMESTAMPTZ(6),
    "finished_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "runs" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "agent_id" TEXT NOT NULL,
    "task_id" TEXT,
    "status" "run_status" NOT NULL DEFAULT 'running',
    "turn_count" INTEGER NOT NULL DEFAULT 0,
    "lease_owner" TEXT,
    "lease_expires_at" TIMESTAMPTZ(6),
    "error" TEXT,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transcript_entries" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "agent_id" TEXT NOT NULL,
    "run_id" TEXT,
    "seq" INTEGER NOT NULL,
    "kind" "transcript_entry_kind" NOT NULL,
    "content" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transcript_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_records" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "model_id" TEXT NOT NULL,
    "agent_id" TEXT NOT NULL,
    "run_id" TEXT,
    "input_tokens" INTEGER NOT NULL,
    "output_tokens" INTEGER NOT NULL,
    "cache_read_tokens" INTEGER NOT NULL DEFAULT 0,
    "cache_write_tokens" INTEGER NOT NULL DEFAULT 0,
    "cost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usage_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reports" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "agent_id" TEXT NOT NULL,
    "body_md" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "owners_username_key" ON "owners"("username");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");

-- CreateIndex
CREATE INDEX "sessions_owner_id_idx" ON "sessions"("owner_id");

-- CreateIndex
CREATE UNIQUE INDEX "providers_owner_id_name_key" ON "providers"("owner_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "provider_models_provider_id_model_id_key" ON "provider_models"("provider_id", "model_id");

-- CreateIndex
CREATE UNIQUE INDEX "departments_manager_agent_id_key" ON "departments"("manager_agent_id");

-- CreateIndex
CREATE INDEX "departments_owner_id_idx" ON "departments"("owner_id");

-- CreateIndex
CREATE INDEX "agents_owner_id_status_idx" ON "agents"("owner_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "agents_owner_id_name_key" ON "agents"("owner_id", "name");

-- CreateIndex
CREATE INDEX "instructions_owner_id_scope_idx" ON "instructions"("owner_id", "scope");

-- CreateIndex
CREATE UNIQUE INDEX "skills_owner_id_name_key" ON "skills"("owner_id", "name");

-- CreateIndex
CREATE INDEX "skill_attachments_owner_id_agent_id_idx" ON "skill_attachments"("owner_id", "agent_id");

-- CreateIndex
CREATE INDEX "skill_attachments_owner_id_role_idx" ON "skill_attachments"("owner_id", "role");

-- CreateIndex
CREATE UNIQUE INDEX "preferences_owner_id_key_key" ON "preferences"("owner_id", "key");

-- CreateIndex
CREATE INDEX "tasks_owner_id_assignee_agent_id_status_idx" ON "tasks"("owner_id", "assignee_agent_id", "status");

-- CreateIndex
CREATE INDEX "runs_owner_id_agent_id_status_idx" ON "runs"("owner_id", "agent_id", "status");

-- CreateIndex
CREATE INDEX "runs_status_lease_expires_at_idx" ON "runs"("status", "lease_expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "transcript_entries_agent_id_seq_key" ON "transcript_entries"("agent_id", "seq");

-- CreateIndex
CREATE INDEX "usage_records_owner_id_provider_id_created_at_idx" ON "usage_records"("owner_id", "provider_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "reports_task_id_key" ON "reports"("task_id");

-- CreateIndex
CREATE INDEX "reports_owner_id_created_at_idx" ON "reports"("owner_id", "created_at");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "owners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "providers" ADD CONSTRAINT "providers_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "owners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_models" ADD CONSTRAINT "provider_models_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "owners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_models" ADD CONSTRAINT "provider_models_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "owners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_manager_agent_id_fkey" FOREIGN KEY ("manager_agent_id") REFERENCES "agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agents" ADD CONSTRAINT "agents_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "owners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agents" ADD CONSTRAINT "agents_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agents" ADD CONSTRAINT "agents_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "providers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "instructions" ADD CONSTRAINT "instructions_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "owners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "instructions" ADD CONSTRAINT "instructions_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skills" ADD CONSTRAINT "skills_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "owners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skill_attachments" ADD CONSTRAINT "skill_attachments_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "owners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skill_attachments" ADD CONSTRAINT "skill_attachments_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "skills"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skill_attachments" ADD CONSTRAINT "skill_attachments_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "preferences" ADD CONSTRAINT "preferences_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "owners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "owners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assignee_agent_id_fkey" FOREIGN KEY ("assignee_agent_id") REFERENCES "agents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_delegator_agent_id_fkey" FOREIGN KEY ("delegator_agent_id") REFERENCES "agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_parent_task_id_fkey" FOREIGN KEY ("parent_task_id") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "runs" ADD CONSTRAINT "runs_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "owners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "runs" ADD CONSTRAINT "runs_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "runs" ADD CONSTRAINT "runs_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transcript_entries" ADD CONSTRAINT "transcript_entries_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "owners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transcript_entries" ADD CONSTRAINT "transcript_entries_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transcript_entries" ADD CONSTRAINT "transcript_entries_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_records" ADD CONSTRAINT "usage_records_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "owners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_records" ADD CONSTRAINT "usage_records_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_records" ADD CONSTRAINT "usage_records_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_records" ADD CONSTRAINT "usage_records_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "owners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
