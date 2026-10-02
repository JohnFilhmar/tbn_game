-- CreateEnum
CREATE TYPE "run_pause_reason" AS ENUM ('waiting_on_subtasks', 'cap_limit', 'breaker_open', 'out_of_credit', 'runaway_guard');

-- CreateEnum
CREATE TYPE "cap_length_unit" AS ENUM ('hour', 'day', 'week', 'month');

-- CreateEnum
CREATE TYPE "cap_reset_mode" AS ENUM ('rolling', 'fixed');

-- CreateEnum
CREATE TYPE "cap_unit" AS ENUM ('tokens', 'requests', 'money');

-- AlterEnum
ALTER TYPE "agent_status" ADD VALUE 'terminated';

-- AlterEnum
ALTER TYPE "run_status" ADD VALUE 'paused';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "transcript_entry_kind" ADD VALUE 'agent_message';
ALTER TYPE "transcript_entry_kind" ADD VALUE 'subtask_result';
ALTER TYPE "transcript_entry_kind" ADD VALUE 'compaction';

-- AlterTable
ALTER TABLE "agents" ADD COLUMN     "idle_since" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "provider_models" ADD COLUMN     "context_window_tokens" INTEGER NOT NULL DEFAULT 128000;

-- AlterTable
ALTER TABLE "providers" ADD COLUMN     "breaker_failures" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "breaker_open_until" TIMESTAMPTZ(6),
ADD COLUMN     "is_local" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "max_parallel_requests" INTEGER,
ADD COLUMN     "out_of_credit_since" TIMESTAMPTZ(6);

-- AlterTable
ALTER TABLE "runs" ADD COLUMN     "guard_turns" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "pause_reason" "run_pause_reason",
ADD COLUMN     "resume_at" TIMESTAMPTZ(6);

-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "delegator_notified_at" TIMESTAMPTZ(6),
ADD COLUMN     "status_reason" TEXT;

-- AlterTable
ALTER TABLE "transcript_entries" ADD COLUMN     "dedupe_key" TEXT;

-- CreateTable
CREATE TABLE "cap_windows" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "model_id" TEXT,
    "name" TEXT NOT NULL,
    "length_count" INTEGER NOT NULL,
    "length_unit" "cap_length_unit" NOT NULL,
    "reset_mode" "cap_reset_mode" NOT NULL,
    "anchor_at" TIMESTAMPTZ(6),
    "unit" "cap_unit" NOT NULL,
    "limit" DOUBLE PRECISION NOT NULL,
    "threshold_percent" INTEGER,
    "enforced" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "cap_windows_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cap_windows_owner_id_provider_id_idx" ON "cap_windows"("owner_id", "provider_id");

-- CreateIndex
CREATE INDEX "agents_owner_id_department_id_level_idx" ON "agents"("owner_id", "department_id", "level");

-- CreateIndex
CREATE INDEX "runs_status_resume_at_idx" ON "runs"("status", "resume_at");

-- CreateIndex
CREATE INDEX "tasks_owner_id_parent_task_id_idx" ON "tasks"("owner_id", "parent_task_id");

-- CreateIndex
CREATE INDEX "tasks_owner_id_delegator_agent_id_status_idx" ON "tasks"("owner_id", "delegator_agent_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "transcript_entries_agent_id_dedupe_key_key" ON "transcript_entries"("agent_id", "dedupe_key");

-- AddForeignKey
ALTER TABLE "cap_windows" ADD CONSTRAINT "cap_windows_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "owners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cap_windows" ADD CONSTRAINT "cap_windows_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

