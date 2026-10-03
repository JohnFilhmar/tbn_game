-- Phase 4d: each environment as the owner arranged it, one row per owner and environment, with
-- the theme and the placed props as JSON, saved whole. The event trigger sends each save to every
-- open tab under the layout's id.

-- CreateTable
CREATE TABLE "world_layouts" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "theme" JSONB NOT NULL DEFAULT '{}',
    "placements" JSONB NOT NULL DEFAULT '[]',
    "revision" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "world_layouts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "world_layouts_owner_id_environment_key" ON "world_layouts"("owner_id", "environment");

-- AddForeignKey
ALTER TABLE "world_layouts" ADD CONSTRAINT "world_layouts_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "owners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE CONSTRAINT TRIGGER tbn_events AFTER INSERT OR UPDATE OR DELETE ON "world_layouts"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  EXECUTE FUNCTION tbn_record_event('world_layout', 'id', 'updated_at');
