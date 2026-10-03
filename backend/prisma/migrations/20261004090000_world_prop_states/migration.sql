-- Phase 4e: each placed prop's own state, one row per owner and placement: blinds open or closed,
-- a lamp's switch, a whiteboard's drawing. Kept apart from the layout, so using a prop never moves
-- the layout's revision. The event trigger sends each change to every open tab under the row's id.

-- CreateTable
CREATE TABLE "world_prop_states" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "placement_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "state" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "world_prop_states_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "world_prop_states_owner_id_environment_idx" ON "world_prop_states"("owner_id", "environment");

-- CreateIndex
CREATE UNIQUE INDEX "world_prop_states_owner_id_placement_id_key" ON "world_prop_states"("owner_id", "placement_id");

-- AddForeignKey
ALTER TABLE "world_prop_states" ADD CONSTRAINT "world_prop_states_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "owners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE CONSTRAINT TRIGGER tbn_events AFTER INSERT OR UPDATE OR DELETE ON "world_prop_states"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  EXECUTE FUNCTION tbn_record_event('world_prop_state', 'id', 'updated_at');
