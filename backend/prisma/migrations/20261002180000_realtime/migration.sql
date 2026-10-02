-- CreateEnum
CREATE TYPE "event_op" AS ENUM ('insert', 'update', 'delete');

-- CreateEnum
CREATE TYPE "command_status" AS ENUM ('running', 'done');

-- CreateTable
CREATE TABLE "events" (
    "owner_id" TEXT NOT NULL,
    "seq" BIGINT NOT NULL,
    "entity" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "op" "event_op" NOT NULL,
    "changed" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "events_pkey" PRIMARY KEY ("owner_id","seq")
);

-- CreateTable
CREATE TABLE "event_heads" (
    "owner_id" TEXT NOT NULL,
    "last_seq" BIGINT NOT NULL,

    CONSTRAINT "event_heads_pkey" PRIMARY KEY ("owner_id")
);

-- CreateTable
CREATE TABLE "commands" (
    "owner_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "status" "command_status" NOT NULL DEFAULT 'running',
    "response_status" INTEGER,
    "response_body" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ(6),

    CONSTRAINT "commands_pkey" PRIMARY KEY ("owner_id","key")
);

-- CreateIndex
CREATE INDEX "events_created_at_idx" ON "events"("created_at");

-- CreateIndex
CREATE INDEX "commands_created_at_idx" ON "commands"("created_at");

-- AddForeignKey
ALTER TABLE "commands" ADD CONSTRAINT "commands_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "owners"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- The event log. A deferred constraint trigger on every table the client reads records each
-- change at commit. It takes the owner's next sequence number from `event_heads` with an upsert
-- whose row lock lasts until the commit ends, so a transaction cannot commit sequence 6 before the
-- one holding 5: sequence order is commit order, and a reader never sees a gap. The lock is the
-- last one a transaction takes, so it cannot close a deadlock. A rolled back transaction records
-- nothing. The log holds no row data, so no secret column leaves its table.
--
-- Arguments: the entity name; the column holding the entity's id, where a column other than `id`
-- makes the row a part of that entity, so any change to it updates the entity; and a comma
-- separated list of columns whose changes alone are not worth an event, such as lease heartbeats.
--
-- Ceiling: the head row serialises the commits that change one owner's state, a few hundred a
-- second at most, and `tbn_changes` assumes one database.
CREATE FUNCTION tbn_record_event() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  entity_name text := TG_ARGV[0];
  id_column text := TG_ARGV[1];
  ignored text[] := string_to_array(TG_ARGV[2], ',');
  row_data jsonb;
  old_data jsonb;
  changed_columns jsonb;
  change event_op := lower(TG_OP)::event_op;
  next_seq bigint;
BEGIN
  IF TG_OP = 'DELETE' THEN
    row_data := to_jsonb(OLD);
  ELSE
    row_data := to_jsonb(NEW);
  END IF;
  IF TG_OP = 'UPDATE' THEN
    old_data := to_jsonb(OLD) - ignored;
    SELECT jsonb_agg(fields.key ORDER BY fields.key)
      INTO changed_columns
      FROM jsonb_each(row_data - ignored) AS fields
      WHERE fields.value IS DISTINCT FROM old_data -> fields.key;
    IF changed_columns IS NULL THEN
      RETURN NULL;
    END IF;
  END IF;
  IF id_column <> 'id' THEN
    change := 'update';
    changed_columns := NULL;
  END IF;
  INSERT INTO event_heads AS head (owner_id, last_seq)
    VALUES (row_data ->> 'owner_id', 1)
    ON CONFLICT (owner_id) DO UPDATE SET last_seq = head.last_seq + 1
    RETURNING head.last_seq INTO next_seq;
  INSERT INTO events (owner_id, seq, entity, entity_id, op, changed)
    VALUES (row_data ->> 'owner_id', next_seq, entity_name, row_data ->> id_column, change,
            changed_columns);
  PERFORM pg_notify('tbn_changes', row_data ->> 'owner_id');
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER tbn_events AFTER INSERT OR UPDATE OR DELETE ON "agents"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  EXECUTE FUNCTION tbn_record_event('agent', 'id', 'updated_at,idle_since');
CREATE CONSTRAINT TRIGGER tbn_events AFTER INSERT OR UPDATE OR DELETE ON "departments"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  EXECUTE FUNCTION tbn_record_event('department', 'id', 'updated_at');
CREATE CONSTRAINT TRIGGER tbn_events AFTER INSERT OR UPDATE OR DELETE ON "tasks"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  EXECUTE FUNCTION tbn_record_event('task', 'id', 'updated_at,delegator_notified_at');
CREATE CONSTRAINT TRIGGER tbn_events AFTER INSERT OR UPDATE OR DELETE ON "reports"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  EXECUTE FUNCTION tbn_record_event('report', 'id', 'search_vector');
CREATE CONSTRAINT TRIGGER tbn_events AFTER INSERT OR UPDATE OR DELETE ON "runs"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  EXECUTE FUNCTION tbn_record_event('run', 'id', 'updated_at,lease_owner,lease_expires_at,guard_turns');
CREATE CONSTRAINT TRIGGER tbn_events AFTER INSERT OR UPDATE OR DELETE ON "run_sources"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  EXECUTE FUNCTION tbn_record_event('run_source', 'id', '');
CREATE CONSTRAINT TRIGGER tbn_events AFTER INSERT OR UPDATE OR DELETE ON "transcript_entries"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  EXECUTE FUNCTION tbn_record_event('transcript_entry', 'id', '');
CREATE CONSTRAINT TRIGGER tbn_events AFTER INSERT OR UPDATE OR DELETE ON "approvals"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  EXECUTE FUNCTION tbn_record_event('approval', 'id', '');
CREATE CONSTRAINT TRIGGER tbn_events AFTER INSERT OR UPDATE OR DELETE ON "sandbox_jobs"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  EXECUTE FUNCTION tbn_record_event('sandbox_job', 'id', 'updated_at');
CREATE CONSTRAINT TRIGGER tbn_events AFTER INSERT OR UPDATE OR DELETE ON "repositories"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  EXECUTE FUNCTION tbn_record_event('repository', 'id', 'updated_at');
CREATE CONSTRAINT TRIGGER tbn_events AFTER INSERT OR UPDATE OR DELETE ON "merge_requests"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  EXECUTE FUNCTION tbn_record_event('merge_request', 'id', '');
CREATE CONSTRAINT TRIGGER tbn_events AFTER INSERT OR UPDATE OR DELETE ON "branch_reviews"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  EXECUTE FUNCTION tbn_record_event('branch_review', 'id', '');
CREATE CONSTRAINT TRIGGER tbn_events AFTER INSERT OR UPDATE OR DELETE ON "providers"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  EXECUTE FUNCTION tbn_record_event('provider', 'id', 'updated_at,breaker_failures,api_key_ciphertext');
CREATE CONSTRAINT TRIGGER tbn_events AFTER INSERT OR UPDATE OR DELETE ON "provider_models"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  EXECUTE FUNCTION tbn_record_event('provider', 'provider_id', '');
CREATE CONSTRAINT TRIGGER tbn_events AFTER INSERT OR UPDATE OR DELETE ON "cap_windows"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  EXECUTE FUNCTION tbn_record_event('cap_windows', 'provider_id', 'updated_at');
CREATE CONSTRAINT TRIGGER tbn_events AFTER INSERT OR UPDATE OR DELETE ON "usage_records"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  EXECUTE FUNCTION tbn_record_event('cap_windows', 'provider_id', '');
CREATE CONSTRAINT TRIGGER tbn_events AFTER INSERT OR UPDATE OR DELETE ON "search_providers"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  EXECUTE FUNCTION tbn_record_event('search_provider', 'id', 'updated_at');
CREATE CONSTRAINT TRIGGER tbn_events AFTER INSERT OR UPDATE OR DELETE ON "integrations"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  EXECUTE FUNCTION tbn_record_event('integration', 'id', 'updated_at');
CREATE CONSTRAINT TRIGGER tbn_events AFTER INSERT OR UPDATE OR DELETE ON "plugins"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  EXECUTE FUNCTION tbn_record_event('plugin', 'id', 'updated_at');
CREATE CONSTRAINT TRIGGER tbn_events AFTER INSERT OR UPDATE OR DELETE ON "notification_channels"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  EXECUTE FUNCTION tbn_record_event('notification_channel', 'id', 'updated_at');
CREATE CONSTRAINT TRIGGER tbn_events AFTER INSERT OR UPDATE OR DELETE ON "notifications"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  EXECUTE FUNCTION tbn_record_event('notification', 'id', '');
CREATE CONSTRAINT TRIGGER tbn_events AFTER INSERT OR UPDATE OR DELETE ON "instructions"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  EXECUTE FUNCTION tbn_record_event('instruction', 'id', 'updated_at');
CREATE CONSTRAINT TRIGGER tbn_events AFTER INSERT OR UPDATE OR DELETE ON "skills"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  EXECUTE FUNCTION tbn_record_event('skill', 'id', 'updated_at');
CREATE CONSTRAINT TRIGGER tbn_events AFTER INSERT OR UPDATE OR DELETE ON "skill_attachments"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  EXECUTE FUNCTION tbn_record_event('skill', 'skill_id', '');
CREATE CONSTRAINT TRIGGER tbn_events AFTER INSERT OR UPDATE OR DELETE ON "preferences"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  EXECUTE FUNCTION tbn_record_event('preferences', 'owner_id', 'updated_at');
