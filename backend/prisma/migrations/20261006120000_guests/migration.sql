-- Phase 4i: guests. A friend arrives through a one-time invite link and keeps a guest session in
-- the tbn_guest cookie; both are stored only as token hashes. A guest's conversation with an
-- agent's persona lives apart from the agent's transcript, and player messages go between two
-- players. Both message tables reach the client through the event log; the gateway delivers each
-- row only to the players it concerns.

-- CreateTable
CREATE TABLE "guests" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "name" TEXT,
    "last_seen_at" TIMESTAMPTZ(6),
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "guests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guest_invites" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "guest_id" TEXT,
    "label" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "redeemed_at" TIMESTAMPTZ(6),
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "guest_invites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guest_sessions" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "guest_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "guest_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guest_chat_messages" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "guest_id" TEXT NOT NULL,
    "agent_id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "is_error" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "guest_chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "player_messages" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "from_id" TEXT NOT NULL,
    "from_name" TEXT NOT NULL,
    "to_id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "read_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "player_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "guests_owner_id_name_key" ON "guests"("owner_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "guest_invites_token_hash_key" ON "guest_invites"("token_hash");

-- CreateIndex
CREATE INDEX "guest_invites_owner_id_idx" ON "guest_invites"("owner_id");

-- CreateIndex
CREATE UNIQUE INDEX "guest_sessions_token_hash_key" ON "guest_sessions"("token_hash");

-- CreateIndex
CREATE INDEX "guest_sessions_guest_id_idx" ON "guest_sessions"("guest_id");

-- CreateIndex
CREATE INDEX "guest_chat_messages_guest_id_agent_id_created_at_idx" ON "guest_chat_messages"("guest_id", "agent_id", "created_at");

-- CreateIndex
CREATE INDEX "player_messages_owner_id_to_id_read_at_idx" ON "player_messages"("owner_id", "to_id", "read_at");

-- CreateIndex
CREATE INDEX "player_messages_owner_id_from_id_idx" ON "player_messages"("owner_id", "from_id");

-- AddForeignKey
ALTER TABLE "guests" ADD CONSTRAINT "guests_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "owners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guest_invites" ADD CONSTRAINT "guest_invites_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "owners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guest_invites" ADD CONSTRAINT "guest_invites_guest_id_fkey" FOREIGN KEY ("guest_id") REFERENCES "guests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guest_sessions" ADD CONSTRAINT "guest_sessions_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "owners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guest_sessions" ADD CONSTRAINT "guest_sessions_guest_id_fkey" FOREIGN KEY ("guest_id") REFERENCES "guests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guest_chat_messages" ADD CONSTRAINT "guest_chat_messages_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "owners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guest_chat_messages" ADD CONSTRAINT "guest_chat_messages_guest_id_fkey" FOREIGN KEY ("guest_id") REFERENCES "guests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guest_chat_messages" ADD CONSTRAINT "guest_chat_messages_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_messages" ADD CONSTRAINT "player_messages_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "owners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE CONSTRAINT TRIGGER tbn_events AFTER INSERT OR UPDATE OR DELETE ON "guest_chat_messages"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  EXECUTE FUNCTION tbn_record_event('guest_chat_message', 'id', '');

CREATE CONSTRAINT TRIGGER tbn_events AFTER INSERT OR UPDATE OR DELETE ON "player_messages"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  EXECUTE FUNCTION tbn_record_event('player_message', 'id', '');
