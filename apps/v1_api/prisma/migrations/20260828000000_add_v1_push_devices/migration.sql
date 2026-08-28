CREATE TYPE "V1PushPlatform" AS ENUM ('android', 'ios');
CREATE TYPE "V1PushEnvironment" AS ENUM ('alpha', 'production');

CREATE TABLE "v1_push_devices" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "installation_id" TEXT NOT NULL,
    "platform" "V1PushPlatform" NOT NULL,
    "environment" "V1PushEnvironment" NOT NULL,
    "token" TEXT NOT NULL,
    "app_version" TEXT,
    "device_model" TEXT,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),
    "failure_count" INTEGER NOT NULL DEFAULT 0,
    "last_failure_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "v1_push_devices_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "v1_push_devices_token_key" ON "v1_push_devices"("token");
CREATE UNIQUE INDEX "v1_push_devices_environment_installation_id_key"
    ON "v1_push_devices"("environment", "installation_id");
CREATE INDEX "v1_push_devices_user_id_environment_revoked_at_idx"
    ON "v1_push_devices"("user_id", "environment", "revoked_at");

ALTER TABLE "v1_push_devices"
    ADD CONSTRAINT "v1_push_devices_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "v1_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
