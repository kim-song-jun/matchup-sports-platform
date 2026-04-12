CREATE TABLE "seed_sync_states" (
    "key" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,
    "payload" JSONB,
    "applied_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seed_sync_states_pkey" PRIMARY KEY ("key")
);
