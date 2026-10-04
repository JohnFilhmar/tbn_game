-- Phase 4h: an agent may decline a task outside its job description; the reason is its result.

-- AlterEnum
ALTER TYPE "task_status" ADD VALUE 'declined';
