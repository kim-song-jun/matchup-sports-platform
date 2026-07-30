CREATE TYPE "V1GameSourceType" AS ENUM ('TEAM_MATCH', 'TOURNAMENT_FIXTURE');
CREATE TYPE "V1GameState" AS ENUM ('SCHEDULED', 'LIVE', 'PAUSED', 'ENDED', 'CANCELLED');
CREATE TYPE "V1GameSideKey" AS ENUM ('HOME', 'AWAY');
CREATE TYPE "V1GamePeriodState" AS ENUM ('SCHEDULED', 'LIVE', 'ENDED');
CREATE TYPE "V1GameLineupState" AS ENUM ('DRAFT', 'SUBMITTED', 'LOCKED');
CREATE TYPE "V1IdentityLinkAction" AS ENUM ('REQUESTED', 'ATTESTED', 'REJECTED', 'EXPIRED', 'REVOKED');
CREATE TYPE "V1IdentityActorType" AS ENUM ('USER', 'SYSTEM');
CREATE TYPE "V1ConsentState" AS ENUM ('GRANTED', 'REVOKED');
CREATE TYPE "V1GameEventType" AS ENUM ('GOAL', 'CARD', 'SUBSTITUTION', 'PERIOD_START', 'PERIOD_END', 'PAUSE', 'RESUME', 'CORRECTION');
CREATE TYPE "V1GameResultRevisionState" AS ENUM ('DRAFT', 'SUBMITTED', 'CHANGE_REQUESTED', 'SUPPLEMENT_REQUESTED', 'REJECTED', 'OFFICIAL', 'VOID');
CREATE TYPE "V1VisibilityMode" AS ENUM ('LIVE', 'STATUS_ONLY');
CREATE TYPE "V1OutboxStatus" AS ENUM ('PENDING', 'PROCESSING', 'RETRY', 'POISONED', 'COMPLETED');
CREATE TYPE "V1ProjectionStatus" AS ENUM ('PENDING', 'APPLIED', 'FAILED');
CREATE TYPE "V1ScheduleType" AS ENUM ('MATCH', 'TRAINING', 'EVENT');
CREATE TYPE "V1ScheduleVisibility" AS ENUM ('TEAM', 'MEMBERS', 'PUBLIC');
CREATE TYPE "V1ScheduleState" AS ENUM ('SCHEDULED', 'CANCELLED', 'COMPLETED');
CREATE TYPE "V1AttendanceStatus" AS ENUM ('GOING', 'MAYBE', 'NOT_GOING', 'WAITLISTED');
CREATE TYPE "V1GuestRecruitmentVisibility" AS ENUM ('MEMBERS', 'PUBLIC');
CREATE TYPE "V1GuestRecruitmentState" AS ENUM ('OPEN', 'CLOSED', 'FILLED');
CREATE TYPE "V1GuestApplicationState" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN');
CREATE TYPE "V1TournamentStaffRole" AS ENUM ('FIELD_OPERATOR', 'SUPPORT_READONLY', 'TOURNAMENT_DIRECTOR', 'PLATFORM_OPS');
CREATE TYPE "V1CompetitionConfigStatus" AS ENUM ('DRAFT', 'ACTIVE', 'RETIRED');
CREATE TYPE "V1EscalationKind" AS ENUM ('REMINDER', 'ESCALATION');
CREATE TYPE "V1EscalationStatus" AS ENUM ('PENDING', 'ACKNOWLEDGED', 'RESOLVED');
CREATE TYPE "V1OperationActorType" AS ENUM ('USER', 'SYSTEM');
CREATE TYPE "V1GameOperationFlagKey" AS ENUM ('GAME_WRITE', 'GAME_READ', 'PUBLIC_LIVE', 'DIRECTOR_OFFICIALIZE');
CREATE TYPE "V1GameWriteMode" AS ENUM ('legacy', 'new');

CREATE TABLE "v1_competition_config_versions" (
  "id" TEXT NOT NULL, "sport_code" TEXT NOT NULL, "name" TEXT NOT NULL, "version" INTEGER NOT NULL,
  "status" "V1CompetitionConfigStatus" NOT NULL DEFAULT 'ACTIVE', "periods" JSONB NOT NULL,
  "events" JSONB NOT NULL, "lineup" JSONB NOT NULL, "result" JSONB NOT NULL, "tie_break" JSONB NOT NULL,
  "visibility" JSONB NOT NULL, "content_hash" TEXT NOT NULL, "created_by_user_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "v1_competition_config_versions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "v1_competition_config_versions_content_hash_key" ON "v1_competition_config_versions"("content_hash");
CREATE UNIQUE INDEX "v1_competition_config_versions_sport_code_name_version_key" ON "v1_competition_config_versions"("sport_code","name","version");

CREATE TABLE "v1_games" (
  "id" TEXT NOT NULL, "source_type" "V1GameSourceType" NOT NULL, "team_match_id" TEXT,
  "tournament_fixture_id" TEXT, "state" "V1GameState" NOT NULL DEFAULT 'SCHEDULED', "version" INTEGER NOT NULL DEFAULT 0,
  "last_sequence" INTEGER NOT NULL DEFAULT 0, "current_official_revision_id" TEXT,
  "competition_config_version_id" TEXT NOT NULL, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL, CONSTRAINT "v1_games_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "v1_games_source_exactly_one_ck" CHECK (("source_type" = 'TEAM_MATCH' AND "team_match_id" IS NOT NULL AND "tournament_fixture_id" IS NULL) OR ("source_type" = 'TOURNAMENT_FIXTURE' AND "tournament_fixture_id" IS NOT NULL AND "team_match_id" IS NULL))
);
CREATE UNIQUE INDEX "v1_games_team_match_id_key" ON "v1_games"("team_match_id");
CREATE UNIQUE INDEX "v1_games_tournament_fixture_id_key" ON "v1_games"("tournament_fixture_id");
CREATE UNIQUE INDEX "v1_games_id_current_official_revision_key" ON "v1_games"("id","current_official_revision_id");
CREATE INDEX "v1_games_state_updated_at_idx" ON "v1_games"("state","updated_at");
CREATE INDEX "v1_games_source_type_created_at_idx" ON "v1_games"("source_type","created_at");

CREATE TABLE "v1_game_sides" (
  "id" TEXT NOT NULL, "game_id" TEXT NOT NULL, "side_key" "V1GameSideKey" NOT NULL, "team_id" TEXT,
  "display_name_snapshot" TEXT NOT NULL, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "v1_game_sides_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "v1_game_sides_game_id_side_key_key" ON "v1_game_sides"("game_id","side_key");
CREATE INDEX "v1_game_sides_team_id_idx" ON "v1_game_sides"("team_id");

CREATE TABLE "v1_game_periods" (
  "id" TEXT NOT NULL, "game_id" TEXT NOT NULL, "number" INTEGER NOT NULL, "state" "V1GamePeriodState" NOT NULL DEFAULT 'SCHEDULED',
  "started_at" TIMESTAMP(3), "ended_at" TIMESTAMP(3), "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "v1_game_periods_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "v1_game_periods_game_id_number_key" ON "v1_game_periods"("game_id","number");
CREATE INDEX "v1_game_periods_game_id_state_idx" ON "v1_game_periods"("game_id","state");

CREATE TABLE "v1_game_lineups" (
  "id" TEXT NOT NULL, "game_id" TEXT NOT NULL, "side_id" TEXT NOT NULL, "revision" INTEGER NOT NULL,
  "state" "V1GameLineupState" NOT NULL DEFAULT 'DRAFT', "version" INTEGER NOT NULL DEFAULT 0,
  "submitted_at" TIMESTAMP(3), "supersedes_id" TEXT, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "v1_game_lineups_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "v1_game_lineups_game_id_side_id_revision_key" ON "v1_game_lineups"("game_id","side_id","revision");
CREATE INDEX "v1_game_lineups_game_id_side_id_state_idx" ON "v1_game_lineups"("game_id","side_id","state");

CREATE TABLE "v1_game_participants" (
  "id" TEXT NOT NULL, "game_id" TEXT NOT NULL, "side_id" TEXT NOT NULL, "lineup_id" TEXT NOT NULL,
  "display_name_snapshot" TEXT NOT NULL, "jersey_number" INTEGER, "position" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "v1_game_participants_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "v1_game_participants_game_id_side_id_idx" ON "v1_game_participants"("game_id","side_id");

CREATE TABLE "v1_participant_identity_link_events" (
  "id" TEXT NOT NULL, "participant_id" TEXT NOT NULL, "link_id" TEXT NOT NULL, "event_version" INTEGER NOT NULL,
  "request_id" TEXT NOT NULL, "action" "V1IdentityLinkAction" NOT NULL, "user_id" TEXT NOT NULL,
  "effective_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "actor_type" "V1IdentityActorType" NOT NULL,
  "actor_user_id" TEXT, "system_actor" TEXT, "reason" TEXT, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "v1_participant_identity_link_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "v1_identity_event_actor_ck" CHECK (("actor_type"='USER' AND "actor_user_id" IS NOT NULL AND "system_actor" IS NULL) OR ("actor_type"='SYSTEM' AND "actor_user_id" IS NULL AND "system_actor" IS NOT NULL))
);
CREATE UNIQUE INDEX "v1_identity_events_participant_version_key" ON "v1_participant_identity_link_events"("participant_id","event_version");
CREATE UNIQUE INDEX "v1_identity_events_request_action_actor_key" ON "v1_participant_identity_link_events"("request_id","action",(COALESCE("actor_user_id","system_actor")));
CREATE UNIQUE INDEX "v1_participant_identity_link_events_request_id_action_actor_key" ON "v1_participant_identity_link_events"("request_id","action","actor_user_id","system_actor");
CREATE UNIQUE INDEX "v1_identity_events_link_action_key" ON "v1_participant_identity_link_events"("link_id","action");
CREATE INDEX "v1_participant_identity_link_events_participant_id_effectiv_idx" ON "v1_participant_identity_link_events"("participant_id","effective_at");

CREATE TABLE "v1_participant_identity_link_current" (
  "participant_id" TEXT NOT NULL, "link_id" TEXT NOT NULL, "user_id" TEXT NOT NULL, "version" INTEGER NOT NULL,
  "effective_from" TIMESTAMP(3) NOT NULL, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "v1_participant_identity_link_current_pkey" PRIMARY KEY ("participant_id")
);
CREATE UNIQUE INDEX "v1_identity_link_current_link_id_key" ON "v1_participant_identity_link_current"("link_id");

CREATE TABLE "v1_participant_consent_snapshots" (
  "id" TEXT NOT NULL, "participant_id" TEXT NOT NULL, "link_id" TEXT NOT NULL, "consent_version" INTEGER NOT NULL,
  "state" "V1ConsentState" NOT NULL, "effective_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "policy_hash" TEXT NOT NULL, "actor_user_id" TEXT NOT NULL, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "v1_participant_consent_snapshots_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "v1_consent_participant_version_key" ON "v1_participant_consent_snapshots"("participant_id","consent_version");
CREATE INDEX "v1_consent_participant_effective_at_idx" ON "v1_participant_consent_snapshots"("participant_id","effective_at");

CREATE TABLE "v1_game_events" (
  "id" TEXT NOT NULL, "game_id" TEXT NOT NULL, "sequence" INTEGER NOT NULL, "client_event_id" TEXT NOT NULL,
  "payload_hash" TEXT NOT NULL, "type" "V1GameEventType" NOT NULL, "side_id" TEXT, "participant_id" TEXT,
  "period" INTEGER NOT NULL, "clock_ms" INTEGER NOT NULL, "occurred_at" TIMESTAMP(3) NOT NULL,
  "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "actor_user_id" TEXT NOT NULL,
  "reverses_event_id" TEXT, "payload" JSONB NOT NULL, CONSTRAINT "v1_game_events_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "v1_game_events_game_sequence_key" ON "v1_game_events"("game_id","sequence");
CREATE UNIQUE INDEX "v1_game_events_game_client_event_key" ON "v1_game_events"("game_id","client_event_id");
CREATE UNIQUE INDEX "v1_game_events_reverses_event_id_key" ON "v1_game_events"("reverses_event_id");
CREATE INDEX "v1_game_events_game_id_period_sequence_idx" ON "v1_game_events"("game_id","period","sequence");

CREATE TABLE "v1_game_result_revisions" (
  "id" TEXT NOT NULL, "game_id" TEXT NOT NULL, "revision" INTEGER NOT NULL, "state" "V1GameResultRevisionState" NOT NULL DEFAULT 'DRAFT',
  "score" JSONB NOT NULL, "events_hash" TEXT NOT NULL, "missing_scorer" BOOLEAN NOT NULL DEFAULT false, "mvp_participant_id" TEXT,
  "reason" TEXT, "created_by_actor_type" "V1IdentityActorType" NOT NULL, "created_by_user_id" TEXT, "created_by_system_actor" TEXT,
  "supersedes_id" TEXT, "submitted_at" TIMESTAMP(3), "official_at" TIMESTAMP(3), "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "v1_game_result_revisions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "v1_result_revision_actor_ck" CHECK (("created_by_actor_type"='USER' AND "created_by_user_id" IS NOT NULL AND "created_by_system_actor" IS NULL) OR ("created_by_actor_type"='SYSTEM' AND "created_by_user_id" IS NULL AND "created_by_system_actor" IS NOT NULL))
);
CREATE UNIQUE INDEX "v1_game_result_revisions_game_revision_key" ON "v1_game_result_revisions"("game_id","revision");
CREATE UNIQUE INDEX "v1_game_result_revisions_game_id_id_key" ON "v1_game_result_revisions"("game_id","id");
CREATE INDEX "v1_game_result_revisions_game_id_state_idx" ON "v1_game_result_revisions"("game_id","state");

CREATE TABLE "v1_game_result_participants" (
  "id" TEXT NOT NULL, "result_revision_id" TEXT NOT NULL, "participant_id" TEXT NOT NULL, "side_id" TEXT NOT NULL,
  "started" BOOLEAN NOT NULL DEFAULT false, "minutes_played" INTEGER, "goals" INTEGER NOT NULL DEFAULT 0, "cards" JSONB NOT NULL,
  "goalkeeper" BOOLEAN NOT NULL DEFAULT false, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "v1_game_result_participants_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "v1_game_result_participants_revision_participant_key" ON "v1_game_result_participants"("result_revision_id","participant_id");

CREATE TABLE "v1_game_result_decisions" (
  "id" TEXT NOT NULL, "revision_id" TEXT NOT NULL, "decision" TEXT NOT NULL, "reason" TEXT,
  "actor_type" "V1IdentityActorType" NOT NULL, "actor_user_id" TEXT NOT NULL, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "v1_game_result_decisions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "v1_game_result_decisions_revision_actor_decision_key" ON "v1_game_result_decisions"("revision_id","actor_user_id","decision");

CREATE TABLE "v1_game_visibility_policies" (
  "game_id" TEXT NOT NULL, "mode" "V1VisibilityMode" NOT NULL DEFAULT 'LIVE', "lineup_at" TIMESTAMP(3), "version" INTEGER NOT NULL DEFAULT 0, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "v1_game_visibility_policies_pkey" PRIMARY KEY ("game_id")
);

CREATE TABLE "v1_outbox_events" (
  "id" TEXT NOT NULL, "business_key" TEXT NOT NULL, "aggregate_type" TEXT NOT NULL, "aggregate_id" TEXT NOT NULL, "revision_id" TEXT,
  "type" TEXT NOT NULL, "payload" JSONB NOT NULL, "available_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "lease_owner" TEXT, "lease_until" TIMESTAMP(3),
  "attempts" INTEGER NOT NULL DEFAULT 0, "retry_generation" INTEGER NOT NULL DEFAULT 0, "version" INTEGER NOT NULL DEFAULT 0,
  "status" "V1OutboxStatus" NOT NULL DEFAULT 'PENDING', "last_error" TEXT, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "v1_outbox_events_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "v1_outbox_events_business_key_key" ON "v1_outbox_events"("business_key");
CREATE INDEX "v1_outbox_events_status_available_at_idx" ON "v1_outbox_events"("status","available_at");
CREATE INDEX "v1_outbox_events_lease_until_idx" ON "v1_outbox_events"("lease_until");

CREATE TABLE "v1_idempotency_records" (
  "id" TEXT NOT NULL, "actor_user_id" TEXT NOT NULL, "action" TEXT NOT NULL, "resource_type" TEXT NOT NULL, "resource_id" TEXT NOT NULL,
  "idempotency_key" TEXT NOT NULL, "payload_hash" TEXT NOT NULL, "response_status" INTEGER NOT NULL, "response_body" JSONB NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "v1_idempotency_records_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "v1_idempotency_records_scope_key" ON "v1_idempotency_records"("actor_user_id","action","resource_type","resource_id","idempotency_key");
CREATE INDEX "v1_idempotency_records_expires_at_idx" ON "v1_idempotency_records"("expires_at");

CREATE TABLE "v1_projection_watermarks" (
  "id" TEXT NOT NULL, "projection" TEXT NOT NULL, "entity_type" TEXT NOT NULL, "entity_id" TEXT NOT NULL, "revision_id" TEXT NOT NULL,
  "source_hash" TEXT NOT NULL, "projected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "status" "V1ProjectionStatus" NOT NULL,
  CONSTRAINT "v1_projection_watermarks_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "v1_projection_watermarks_projection_entity_key" ON "v1_projection_watermarks"("projection","entity_type","entity_id");

CREATE TABLE "v1_team_schedules" (
  "id" TEXT NOT NULL, "team_id" TEXT NOT NULL, "team_match_id" TEXT, "title" TEXT NOT NULL, "type" "V1ScheduleType" NOT NULL,
  "start_at" TIMESTAMP(3) NOT NULL, "end_at" TIMESTAMP(3) NOT NULL, "timezone" TEXT NOT NULL, "capacity" INTEGER, "rsvp_deadline_at" TIMESTAMP(3),
  "visibility" "V1ScheduleVisibility" NOT NULL DEFAULT 'TEAM', "state" "V1ScheduleState" NOT NULL DEFAULT 'SCHEDULED', "version" INTEGER NOT NULL DEFAULT 0,
  "cancel_reason" TEXT, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "v1_team_schedules_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "v1_team_schedules_team_start_idx" ON "v1_team_schedules"("team_id","start_at");
CREATE INDEX "v1_team_schedules_team_match_idx" ON "v1_team_schedules"("team_match_id");

CREATE TABLE "v1_schedule_attendance" (
  "id" TEXT NOT NULL, "schedule_id" TEXT NOT NULL, "user_id" TEXT NOT NULL, "status" "V1AttendanceStatus" NOT NULL, "waitlist_position" INTEGER,
  "version" INTEGER NOT NULL DEFAULT 0, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "v1_schedule_attendance_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "v1_schedule_attendance_schedule_user_key" ON "v1_schedule_attendance"("schedule_id","user_id");

CREATE TABLE "v1_schedule_guest_recruitments" (
  "id" TEXT NOT NULL, "schedule_id" TEXT NOT NULL, "slots" INTEGER NOT NULL, "closes_at" TIMESTAMP(3) NOT NULL, "note" TEXT,
  "visibility" "V1GuestRecruitmentVisibility" NOT NULL DEFAULT 'MEMBERS', "state" "V1GuestRecruitmentState" NOT NULL DEFAULT 'OPEN', "version" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "v1_schedule_guest_recruitments_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "v1_schedule_guest_recruitments_schedule_id_key" ON "v1_schedule_guest_recruitments"("schedule_id");

CREATE TABLE "v1_schedule_guest_applications" (
  "id" TEXT NOT NULL, "recruitment_id" TEXT NOT NULL, "user_id" TEXT NOT NULL, "display_name_snapshot" TEXT NOT NULL, "note" TEXT,
  "state" "V1GuestApplicationState" NOT NULL DEFAULT 'PENDING', "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "v1_schedule_guest_applications_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "v1_schedule_guest_applications_recruitment_user_key" ON "v1_schedule_guest_applications"("recruitment_id","user_id");

CREATE TABLE "v1_tournament_fields" (
  "id" TEXT NOT NULL, "tournament_id" TEXT NOT NULL, "scope_key" TEXT NOT NULL, "name" TEXT NOT NULL, "sort_order" INTEGER NOT NULL DEFAULT 0, "active" BOOLEAN NOT NULL DEFAULT true,
  "version" INTEGER NOT NULL DEFAULT 0, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "v1_tournament_fields_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "v1_tournament_fields_tournament_scope_key" ON "v1_tournament_fields"("tournament_id","scope_key");
CREATE UNIQUE INDEX "v1_tournament_fields_tournament_id_id_key" ON "v1_tournament_fields"("tournament_id","id");

CREATE TABLE "v1_tournament_staff_assignments" (
  "id" TEXT NOT NULL, "tournament_id" TEXT NOT NULL, "user_id" TEXT NOT NULL, "role" "V1TournamentStaffRole" NOT NULL, "field_id" TEXT,
  "version" INTEGER NOT NULL DEFAULT 0, "expires_at" TIMESTAMP(3), "revoked_at" TIMESTAMP(3), "granted_by_user_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "v1_tournament_staff_assignments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "v1_tournament_staff_assignment_scope_ck" CHECK (("role" IN ('TOURNAMENT_DIRECTOR','SUPPORT_READONLY','PLATFORM_OPS') AND "field_id" IS NULL) OR ("role"='FIELD_OPERATOR'))
);
CREATE INDEX "v1_tournament_staff_assignments_user_idx" ON "v1_tournament_staff_assignments"("user_id","revoked_at","expires_at");
CREATE INDEX "v1_tournament_staff_assignments_tournament_role_idx" ON "v1_tournament_staff_assignments"("tournament_id","role");

CREATE TABLE "v1_tournament_staff_fixture_scopes" (
  "id" TEXT NOT NULL, "assignment_id" TEXT NOT NULL, "fixture_id" TEXT NOT NULL, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "v1_tournament_staff_fixture_scopes_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "v1_tournament_staff_fixture_scopes_assignment_fixture_key" ON "v1_tournament_staff_fixture_scopes"("assignment_id","fixture_id");

CREATE TABLE "v1_result_escalations" (
  "id" TEXT NOT NULL, "result_revision_id" TEXT NOT NULL, "kind" "V1EscalationKind" NOT NULL, "due_at" TIMESTAMP(3) NOT NULL,
  "status" "V1EscalationStatus" NOT NULL DEFAULT 'PENDING', "ack_by_user_id" TEXT, "resolved_by_user_id" TEXT, "reason" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "v1_result_escalations_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "v1_result_escalations_revision_kind_key" ON "v1_result_escalations"("result_revision_id","kind");
CREATE INDEX "v1_result_escalations_status_due_idx" ON "v1_result_escalations"("status","due_at");

CREATE TABLE "v1_game_operation_flags" (
  "id" TEXT NOT NULL, "key" "V1GameOperationFlagKey" NOT NULL, "value" TEXT NOT NULL, "version" INTEGER NOT NULL DEFAULT 0,
  "owner_actor" TEXT NOT NULL, "updated_by_user_id" TEXT, "rollback_value" TEXT, "updated_at" TIMESTAMP(3) NOT NULL, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "v1_game_operation_flags_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "v1_game_operation_flags_key_key" ON "v1_game_operation_flags"("key");

CREATE TABLE "v1_game_cutover_epochs" (
  "id" TEXT NOT NULL DEFAULT 'game-cutover', "version" INTEGER NOT NULL DEFAULT 0, "write_mode" "V1GameWriteMode" NOT NULL DEFAULT 'legacy',
  "first_new_write_at" TIMESTAMP(3), "first_new_write_resource_id" TEXT, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "v1_game_cutover_epochs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "v1_operation_audits" (
  "id" TEXT NOT NULL, "actor_type" "V1OperationActorType" NOT NULL, "actor_user_id" TEXT, "system_actor" TEXT,
  "action" TEXT NOT NULL, "resource_type" TEXT NOT NULL, "resource_id" TEXT NOT NULL, "request_id" TEXT NOT NULL, "source_ip" TEXT,
  "before" JSONB, "after" JSONB, "reason" TEXT, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "v1_operation_audits_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "v1_operation_audits_actor_ck" CHECK (("actor_type"='USER' AND "actor_user_id" IS NOT NULL AND "system_actor" IS NULL) OR ("actor_type"='SYSTEM' AND "actor_user_id" IS NULL AND "system_actor" IS NOT NULL))
);
CREATE INDEX "v1_operation_audits_resource_idx" ON "v1_operation_audits"("resource_type","resource_id","created_at");
CREATE INDEX "v1_operation_audits_actor_idx" ON "v1_operation_audits"("actor_user_id","created_at");

CREATE OR REPLACE FUNCTION v1_guard_game_revision_pointer() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.current_official_revision_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM v1_game_result_revisions r WHERE r.game_id = NEW.id AND r.id = NEW.current_official_revision_id
  ) THEN RAISE EXCEPTION 'current official revision must belong to game %', NEW.id USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER v1_game_revision_pointer_fk AFTER INSERT OR UPDATE ON v1_games DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION v1_guard_game_revision_pointer();

CREATE OR REPLACE FUNCTION v1_guard_game_event_reversal() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.reverses_event_id IS NOT NULL AND (NEW.reverses_event_id = NEW.id OR NOT EXISTS (SELECT 1 FROM v1_game_events e WHERE e.id = NEW.reverses_event_id AND e.game_id = NEW.game_id)) THEN
    RAISE EXCEPTION 'reversal must target another event in the same game' USING ERRCODE = '23514';
  END IF; RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER v1_game_event_reversal_fk AFTER INSERT OR UPDATE ON v1_game_events DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION v1_guard_game_event_reversal();

CREATE OR REPLACE FUNCTION v1_block_terminal_revision_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.state IN ('CHANGE_REQUESTED','SUPPLEMENT_REQUESTED','REJECTED','OFFICIAL','VOID') THEN RAISE EXCEPTION 'terminal result revisions are immutable' USING ERRCODE = '55000'; END IF;
    RETURN OLD;
  END IF;
  IF OLD.state IN ('CHANGE_REQUESTED','SUPPLEMENT_REQUESTED','REJECTED','OFFICIAL','VOID') AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'terminal result revisions are immutable' USING ERRCODE = '55000';
  END IF;
  IF OLD.state <> 'DRAFT' AND (NEW.game_id IS DISTINCT FROM OLD.game_id OR NEW.revision IS DISTINCT FROM OLD.revision OR NEW.score IS DISTINCT FROM OLD.score OR NEW.events_hash IS DISTINCT FROM OLD.events_hash OR NEW.missing_scorer IS DISTINCT FROM OLD.missing_scorer OR NEW.mvp_participant_id IS DISTINCT FROM OLD.mvp_participant_id OR NEW.reason IS DISTINCT FROM OLD.reason OR NEW.created_by_actor_type IS DISTINCT FROM OLD.created_by_actor_type OR NEW.created_by_user_id IS DISTINCT FROM OLD.created_by_user_id OR NEW.created_by_system_actor IS DISTINCT FROM OLD.created_by_system_actor OR NEW.supersedes_id IS DISTINCT FROM OLD.supersedes_id OR NEW.created_at IS DISTINCT FROM OLD.created_at) THEN
    RAISE EXCEPTION 'submitted result content is frozen' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER v1_block_terminal_revision_mutation BEFORE UPDATE OR DELETE ON v1_game_result_revisions FOR EACH ROW EXECUTE FUNCTION v1_block_terminal_revision_mutation();

CREATE OR REPLACE FUNCTION v1_guard_result_participant_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE revision_state "V1GameResultRevisionState";
BEGIN
  SELECT state INTO revision_state FROM v1_game_result_revisions WHERE id = COALESCE(NEW.result_revision_id, OLD.result_revision_id) FOR UPDATE;
  IF revision_state IS DISTINCT FROM 'DRAFT' THEN RAISE EXCEPTION 'result participants require a draft revision' USING ERRCODE = '55000'; END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER v1_guard_result_participant_mutation BEFORE INSERT OR UPDATE OR DELETE ON v1_game_result_participants FOR EACH ROW EXECUTE FUNCTION v1_guard_result_participant_mutation();

CREATE OR REPLACE FUNCTION v1_block_used_config_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM v1_games g WHERE g.competition_config_version_id = OLD.id) THEN RAISE EXCEPTION 'referenced competition configs are immutable' USING ERRCODE = '55000'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER v1_block_used_config_mutation BEFORE UPDATE OR DELETE ON v1_competition_config_versions FOR EACH ROW EXECUTE FUNCTION v1_block_used_config_mutation();

CREATE OR REPLACE FUNCTION v1_guard_identity_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.effective_at := CURRENT_TIMESTAMP;
  IF NEW.action IN ('ATTESTED', 'EXPIRED') THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(NEW.link_id, 0));
    IF EXISTS (
      SELECT 1
      FROM v1_participant_identity_link_events p
      WHERE p.link_id = NEW.link_id AND p.action IN ('ATTESTED', 'EXPIRED')
    ) THEN
      RAISE EXCEPTION 'identity terminal action already committed' USING ERRCODE = '40001';
    END IF;
  END IF;
  IF NEW.action = 'ATTESTED' AND NOT EXISTS (SELECT 1 FROM v1_participant_identity_link_events p WHERE p.participant_id = NEW.participant_id AND p.request_id = NEW.request_id AND p.action = 'REQUESTED' AND p.user_id <> NEW.user_id AND p.effective_at <= CURRENT_TIMESTAMP AND p.effective_at >= CURRENT_TIMESTAMP - INTERVAL '24 hours') THEN
    RAISE EXCEPTION 'attestation requires a distinct pending requestor' USING ERRCODE = '23514';
  END IF;
  IF NEW.action = 'EXPIRED' AND NEW.system_actor <> 'IDENTITY_LINK_EXPIRY' THEN RAISE EXCEPTION 'invalid identity expiry actor' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER v1_guard_identity_event BEFORE INSERT ON v1_participant_identity_link_events FOR EACH ROW EXECUTE FUNCTION v1_guard_identity_event();

CREATE OR REPLACE FUNCTION v1_guard_staff_fixture_scope() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE assignment_tournament TEXT; fixture_tournament TEXT;
BEGIN
  SELECT tournament_id INTO assignment_tournament FROM v1_tournament_staff_assignments WHERE id = NEW.assignment_id;
  SELECT tournament_id INTO fixture_tournament FROM v1_tournament_fixtures WHERE id = NEW.fixture_id;
  IF assignment_tournament IS NULL OR fixture_tournament IS NULL OR assignment_tournament <> fixture_tournament THEN RAISE EXCEPTION 'staff fixture scope must stay within tournament' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER v1_guard_staff_fixture_scope AFTER INSERT OR UPDATE ON v1_tournament_staff_fixture_scopes DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION v1_guard_staff_fixture_scope();

CREATE OR REPLACE FUNCTION v1_require_staff_scope() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE assignment_id_value TEXT; assignment_role "V1TournamentStaffRole"; assignment_field TEXT; assignment_revoked TIMESTAMP(3);
BEGIN
  assignment_id_value := COALESCE(to_jsonb(NEW)->>'assignment_id', to_jsonb(OLD)->>'assignment_id', to_jsonb(NEW)->>'id', to_jsonb(OLD)->>'id');
  SELECT role, field_id, revoked_at INTO assignment_role, assignment_field, assignment_revoked FROM v1_tournament_staff_assignments WHERE id = assignment_id_value;
  IF assignment_role = 'FIELD_OPERATOR' AND assignment_revoked IS NULL AND assignment_field IS NULL AND NOT EXISTS (SELECT 1 FROM v1_tournament_staff_fixture_scopes s WHERE s.assignment_id = assignment_id_value) THEN
    RAISE EXCEPTION 'field operator requires a field or fixture scope' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER v1_require_staff_assignment_scope AFTER INSERT OR UPDATE OR DELETE ON v1_tournament_staff_assignments DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION v1_require_staff_scope();
CREATE CONSTRAINT TRIGGER v1_require_staff_fixture_scope AFTER INSERT OR UPDATE OR DELETE ON v1_tournament_staff_fixture_scopes DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION v1_require_staff_scope();

CREATE OR REPLACE FUNCTION v1_guard_version_increment() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.version <> OLD.version + 1 THEN RAISE EXCEPTION 'version compare-and-swap required' USING ERRCODE = '40001'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER v1_outbox_version_cas BEFORE UPDATE ON v1_outbox_events FOR EACH ROW EXECUTE FUNCTION v1_guard_version_increment();
CREATE TRIGGER v1_field_version_cas BEFORE UPDATE ON v1_tournament_fields FOR EACH ROW EXECUTE FUNCTION v1_guard_version_increment();

ALTER TABLE "v1_team_matches" ADD COLUMN IF NOT EXISTS "competition_config_version_id" TEXT;
ALTER TABLE "v1_tournament_fixtures" ADD COLUMN IF NOT EXISTS "competition_config_version_id" TEXT;
ALTER TABLE "v1_team_matches" ADD CONSTRAINT "v1_team_matches_competition_config_fk" FOREIGN KEY ("competition_config_version_id") REFERENCES "v1_competition_config_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "v1_tournament_fixtures" ADD CONSTRAINT "v1_tournament_fixtures_competition_config_fk" FOREIGN KEY ("competition_config_version_id") REFERENCES "v1_competition_config_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "v1_games" ADD CONSTRAINT "v1_games_competition_config_fk" FOREIGN KEY ("competition_config_version_id") REFERENCES "v1_competition_config_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "v1_games" ADD CONSTRAINT "v1_games_team_match_id_fkey" FOREIGN KEY ("team_match_id") REFERENCES "v1_team_matches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "v1_games" ADD CONSTRAINT "v1_games_tournament_fixture_id_fkey" FOREIGN KEY ("tournament_fixture_id") REFERENCES "v1_tournament_fixtures"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "v1_game_sides" ADD CONSTRAINT "v1_game_sides_game_fk" FOREIGN KEY ("game_id") REFERENCES "v1_games"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "v1_game_periods" ADD CONSTRAINT "v1_game_periods_game_fk" FOREIGN KEY ("game_id") REFERENCES "v1_games"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "v1_game_lineups" ADD CONSTRAINT "v1_game_lineups_game_fk" FOREIGN KEY ("game_id") REFERENCES "v1_games"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "v1_game_participants" ADD CONSTRAINT "v1_game_participants_game_fk" FOREIGN KEY ("game_id") REFERENCES "v1_games"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "v1_game_events" ADD CONSTRAINT "v1_game_events_game_fk" FOREIGN KEY ("game_id") REFERENCES "v1_games"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "v1_game_result_revisions" ADD CONSTRAINT "v1_result_revisions_game_fk" FOREIGN KEY ("game_id") REFERENCES "v1_games"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "v1_games" ADD CONSTRAINT "v1_games_current_revision_fk" FOREIGN KEY ("id","current_official_revision_id") REFERENCES "v1_game_result_revisions"("game_id","id") ON DELETE RESTRICT ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "v1_game_result_revisions" ADD CONSTRAINT "v1_result_revisions_supersedes_fk" FOREIGN KEY ("game_id","supersedes_id") REFERENCES "v1_game_result_revisions"("game_id","id") ON DELETE RESTRICT ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "v1_game_result_participants" ADD CONSTRAINT "v1_result_participants_revision_fk" FOREIGN KEY ("result_revision_id") REFERENCES "v1_game_result_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "v1_game_visibility_policies" ADD CONSTRAINT "v1_visibility_game_fk" FOREIGN KEY ("game_id") REFERENCES "v1_games"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "v1_tournament_staff_assignments" ADD CONSTRAINT "v1_staff_field_fk" FOREIGN KEY ("tournament_id","field_id") REFERENCES "v1_tournament_fields"("tournament_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "v1_tournament_staff_fixture_scopes" ADD CONSTRAINT "v1_staff_scope_assignment_fk" FOREIGN KEY ("assignment_id") REFERENCES "v1_tournament_staff_assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "v1_tournament_staff_fixture_scopes" ADD CONSTRAINT "v1_staff_scope_fixture_fk" FOREIGN KEY ("fixture_id") REFERENCES "v1_tournament_fixtures"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "v1_schedule_attendance" ADD CONSTRAINT "v1_schedule_attendance_schedule_fk" FOREIGN KEY ("schedule_id") REFERENCES "v1_team_schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "v1_schedule_guest_recruitments" ADD CONSTRAINT "v1_guest_recruitment_schedule_fk" FOREIGN KEY ("schedule_id") REFERENCES "v1_team_schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "v1_schedule_guest_applications" ADD CONSTRAINT "v1_guest_application_recruitment_fk" FOREIGN KEY ("recruitment_id") REFERENCES "v1_schedule_guest_recruitments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
