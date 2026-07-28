-- v1 대회 도메인 + 검색기록 베이스라인 (gap migration)
-- 이 테이블들은 db push로만 존재해 마이그레이션 체인이 빈 DB에서 깨졌다.
-- 전부 idempotent: 테이블이 이미 있는 환경(dev/prod)에서는 no-op.

DO $$ BEGIN
  CREATE TYPE "V1TournamentStatus" AS ENUM ('draft',
    'open',
    'closed',
    'in_progress',
    'completed',
    'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "V1TournamentFormat" AS ENUM ('league',
    'knockout',
    'group_knockout');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "V1TournamentRegistrationStatus" AS ENUM ('draft',
    'submitted',
    'awaiting_payment',
    'payment_checking',
    'paid',
    'confirmed',
    'waitlisted',
    'cancel_requested',
    'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "V1TournamentPlayerEligibility" AS ENUM ('non_pro',
    'pro',
    'needs_review');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "V1TournamentPaymentMethod" AS ENUM ('pg',
    'bank_transfer');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "V1TournamentPaymentStatus" AS ENUM ('ready',
    'paid',
    'failed',
    'cancelled',
    'refunded');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "V1TournamentGroupPhase" AS ENUM ('group',
    'semi',
    'final',
    'third_place');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "V1TournamentFixtureStatus" AS ENUM ('scheduled',
    'in_progress',
    'completed',
    'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "V1TournamentAnnouncementAudience" AS ENUM ('all_registered',
    'confirmed_only',
    'waitlist',
    'public');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "v1_search_histories" (
    id text NOT NULL,
    user_id text,
    session_key text,
    query text NOT NULL,
    filters jsonb,
    searched_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);

CREATE TABLE IF NOT EXISTS "v1_tournaments" (
    id text NOT NULL,
    sport_id text NOT NULL,
    title text NOT NULL,
    status "V1TournamentStatus" DEFAULT 'draft'::"V1TournamentStatus" NOT NULL,
    format "V1TournamentFormat" DEFAULT 'group_knockout'::"V1TournamentFormat" NOT NULL,
    registration_deadline_at timestamp(3) without time zone,
    scheduled_at timestamp(3) without time zone,
    venue text,
    team_count integer DEFAULT 8 NOT NULL,
    min_players integer DEFAULT 6 NOT NULL,
    max_players integer DEFAULT 10 NOT NULL,
    entry_fee integer DEFAULT 0 NOT NULL,
    prize_pool integer,
    prize_breakdown text,
    bank_name text,
    bank_account text,
    bank_holder text,
    rules_text text,
    refund_policy_text text,
    created_by_admin_user_id text,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    deleted_at timestamp(3) without time zone,
    prize_summary text,
    promo_home_badge_text text,
    promo_home_date_text text,
    promo_home_enabled boolean DEFAULT false NOT NULL,
    promo_home_image_url text,
    promo_home_location_text text,
    promo_home_priority integer DEFAULT 0 NOT NULL,
    promo_home_prize_text text,
    promo_home_subtitle text,
    promo_home_teams_text text,
    promo_home_title text,
    promo_list_badge_text text,
    promo_list_date_text text,
    promo_list_enabled boolean DEFAULT false NOT NULL,
    promo_list_image_url text,
    promo_list_location_text text,
    promo_list_priority integer DEFAULT 0 NOT NULL,
    promo_list_prize_text text,
    promo_list_subtitle text,
    promo_list_teams_text text,
    promo_list_title text,
    scheduled_end_at timestamp(3) without time zone,
    cover_image_url text
);

CREATE TABLE IF NOT EXISTS "v1_tournament_registrations" (
    id text NOT NULL,
    tournament_id text NOT NULL,
    team_id text NOT NULL,
    applied_by_user_id text NOT NULL,
    status "V1TournamentRegistrationStatus" DEFAULT 'draft'::"V1TournamentRegistrationStatus" NOT NULL,
    depositor_name text,
    agreed_rules boolean DEFAULT false NOT NULL,
    agreed_privacy boolean DEFAULT false NOT NULL,
    agreed_refund boolean DEFAULT false NOT NULL,
    agreed_media_consent boolean DEFAULT false NOT NULL,
    confirmed_by_admin_user_id text,
    confirmed_at timestamp(3) without time zone,
    roster_locked_at timestamp(3) without time zone,
    cancel_requested_at timestamp(3) without time zone,
    cancel_reason text,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    cancel_previous_status "V1TournamentRegistrationStatus"
);

CREATE TABLE IF NOT EXISTS "v1_tournament_players" (
    id text NOT NULL,
    registration_id text NOT NULL,
    user_id text NOT NULL,
    real_name text NOT NULL,
    birth_date_snapshot text,
    eligibility_status "V1TournamentPlayerEligibility" DEFAULT 'needs_review'::"V1TournamentPlayerEligibility" NOT NULL,
    eligibility_note text,
    added_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    removed_at timestamp(3) without time zone,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);

CREATE TABLE IF NOT EXISTS "v1_tournament_payments" (
    id text NOT NULL,
    registration_id text NOT NULL,
    method "V1TournamentPaymentMethod" NOT NULL,
    provider text,
    provider_tx_id text,
    amount integer NOT NULL,
    status "V1TournamentPaymentStatus" DEFAULT 'ready'::"V1TournamentPaymentStatus" NOT NULL,
    paid_at timestamp(3) without time zone,
    cancelled_at timestamp(3) without time zone,
    refunded_at timestamp(3) without time zone,
    confirmed_by_admin_user_id text,
    raw_webhook_ref text,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);

CREATE TABLE IF NOT EXISTS "v1_tournament_groups" (
    id text NOT NULL,
    tournament_id text NOT NULL,
    name text NOT NULL,
    phase "V1TournamentGroupPhase" DEFAULT 'group'::"V1TournamentGroupPhase" NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    advance_count integer,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);

CREATE TABLE IF NOT EXISTS "v1_tournament_group_teams" (
    id text NOT NULL,
    group_id text NOT NULL,
    registration_id text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS "v1_tournament_fixtures" (
    id text NOT NULL,
    tournament_id text NOT NULL,
    group_id text,
    round text NOT NULL,
    fixture_number integer NOT NULL,
    leg_number integer DEFAULT 1 NOT NULL,
    parent_fixture_id text,
    home_registration_id text,
    away_registration_id text,
    scheduled_at timestamp(3) without time zone,
    venue text,
    status "V1TournamentFixtureStatus" DEFAULT 'scheduled'::"V1TournamentFixtureStatus" NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);

CREATE TABLE IF NOT EXISTS "v1_tournament_fixture_results" (
    id text NOT NULL,
    fixture_id text NOT NULL,
    home_score integer DEFAULT 0 NOT NULL,
    away_score integer DEFAULT 0 NOT NULL,
    has_penalty boolean DEFAULT false NOT NULL,
    home_penalty_score integer,
    away_penalty_score integer,
    note text,
    recorded_by_admin_user_id text,
    recorded_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);

CREATE TABLE IF NOT EXISTS "v1_tournament_standings" (
    id text NOT NULL,
    group_id text NOT NULL,
    registration_id text NOT NULL,
    points integer DEFAULT 0 NOT NULL,
    wins integer DEFAULT 0 NOT NULL,
    draws integer DEFAULT 0 NOT NULL,
    losses integer DEFAULT 0 NOT NULL,
    goals_for integer DEFAULT 0 NOT NULL,
    goals_against integer DEFAULT 0 NOT NULL,
    "position" integer,
    recalculated_at timestamp(3) without time zone,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);

CREATE TABLE IF NOT EXISTS "v1_tournament_announcements" (
    id text NOT NULL,
    tournament_id text NOT NULL,
    title text NOT NULL,
    body text NOT NULL,
    audience "V1TournamentAnnouncementAudience" DEFAULT 'all_registered'::"V1TournamentAnnouncementAudience" NOT NULL,
    published_at timestamp(3) without time zone,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v1_search_histories_pkey') THEN
    ALTER TABLE "v1_search_histories" ADD CONSTRAINT "v1_search_histories_pkey" PRIMARY KEY (id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v1_tournament_announcements_pkey') THEN
    ALTER TABLE "v1_tournament_announcements" ADD CONSTRAINT "v1_tournament_announcements_pkey" PRIMARY KEY (id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v1_tournament_fixture_results_pkey') THEN
    ALTER TABLE "v1_tournament_fixture_results" ADD CONSTRAINT "v1_tournament_fixture_results_pkey" PRIMARY KEY (id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v1_tournament_fixtures_pkey') THEN
    ALTER TABLE "v1_tournament_fixtures" ADD CONSTRAINT "v1_tournament_fixtures_pkey" PRIMARY KEY (id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v1_tournament_group_teams_pkey') THEN
    ALTER TABLE "v1_tournament_group_teams" ADD CONSTRAINT "v1_tournament_group_teams_pkey" PRIMARY KEY (id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v1_tournament_groups_pkey') THEN
    ALTER TABLE "v1_tournament_groups" ADD CONSTRAINT "v1_tournament_groups_pkey" PRIMARY KEY (id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v1_tournament_payments_pkey') THEN
    ALTER TABLE "v1_tournament_payments" ADD CONSTRAINT "v1_tournament_payments_pkey" PRIMARY KEY (id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v1_tournament_players_pkey') THEN
    ALTER TABLE "v1_tournament_players" ADD CONSTRAINT "v1_tournament_players_pkey" PRIMARY KEY (id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v1_tournament_registrations_pkey') THEN
    ALTER TABLE "v1_tournament_registrations" ADD CONSTRAINT "v1_tournament_registrations_pkey" PRIMARY KEY (id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v1_tournament_standings_pkey') THEN
    ALTER TABLE "v1_tournament_standings" ADD CONSTRAINT "v1_tournament_standings_pkey" PRIMARY KEY (id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v1_tournaments_pkey') THEN
    ALTER TABLE "v1_tournaments" ADD CONSTRAINT "v1_tournaments_pkey" PRIMARY KEY (id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v1_search_histories_user_id_fkey') THEN
    ALTER TABLE "v1_search_histories" ADD CONSTRAINT "v1_search_histories_user_id_fkey" FOREIGN KEY (user_id) REFERENCES v1_users(id) ON UPDATE CASCADE ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v1_tournament_announcements_tournament_id_fkey') THEN
    ALTER TABLE "v1_tournament_announcements" ADD CONSTRAINT "v1_tournament_announcements_tournament_id_fkey" FOREIGN KEY (tournament_id) REFERENCES v1_tournaments(id) ON UPDATE CASCADE ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v1_tournament_fixture_results_fixture_id_fkey') THEN
    ALTER TABLE "v1_tournament_fixture_results" ADD CONSTRAINT "v1_tournament_fixture_results_fixture_id_fkey" FOREIGN KEY (fixture_id) REFERENCES v1_tournament_fixtures(id) ON UPDATE CASCADE ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v1_tournament_fixture_results_recorded_by_admin_user_id_fkey') THEN
    ALTER TABLE "v1_tournament_fixture_results" ADD CONSTRAINT "v1_tournament_fixture_results_recorded_by_admin_user_id_fkey" FOREIGN KEY (recorded_by_admin_user_id) REFERENCES v1_admin_users(id) ON UPDATE CASCADE ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v1_tournament_fixtures_away_registration_id_fkey') THEN
    ALTER TABLE "v1_tournament_fixtures" ADD CONSTRAINT "v1_tournament_fixtures_away_registration_id_fkey" FOREIGN KEY (away_registration_id) REFERENCES v1_tournament_registrations(id) ON UPDATE CASCADE ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v1_tournament_fixtures_group_id_fkey') THEN
    ALTER TABLE "v1_tournament_fixtures" ADD CONSTRAINT "v1_tournament_fixtures_group_id_fkey" FOREIGN KEY (group_id) REFERENCES v1_tournament_groups(id) ON UPDATE CASCADE ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v1_tournament_fixtures_home_registration_id_fkey') THEN
    ALTER TABLE "v1_tournament_fixtures" ADD CONSTRAINT "v1_tournament_fixtures_home_registration_id_fkey" FOREIGN KEY (home_registration_id) REFERENCES v1_tournament_registrations(id) ON UPDATE CASCADE ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v1_tournament_fixtures_parent_fixture_id_fkey') THEN
    ALTER TABLE "v1_tournament_fixtures" ADD CONSTRAINT "v1_tournament_fixtures_parent_fixture_id_fkey" FOREIGN KEY (parent_fixture_id) REFERENCES v1_tournament_fixtures(id) ON UPDATE CASCADE ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v1_tournament_fixtures_tournament_id_fkey') THEN
    ALTER TABLE "v1_tournament_fixtures" ADD CONSTRAINT "v1_tournament_fixtures_tournament_id_fkey" FOREIGN KEY (tournament_id) REFERENCES v1_tournaments(id) ON UPDATE CASCADE ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v1_tournament_group_teams_group_id_fkey') THEN
    ALTER TABLE "v1_tournament_group_teams" ADD CONSTRAINT "v1_tournament_group_teams_group_id_fkey" FOREIGN KEY (group_id) REFERENCES v1_tournament_groups(id) ON UPDATE CASCADE ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v1_tournament_group_teams_registration_id_fkey') THEN
    ALTER TABLE "v1_tournament_group_teams" ADD CONSTRAINT "v1_tournament_group_teams_registration_id_fkey" FOREIGN KEY (registration_id) REFERENCES v1_tournament_registrations(id) ON UPDATE CASCADE ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v1_tournament_groups_tournament_id_fkey') THEN
    ALTER TABLE "v1_tournament_groups" ADD CONSTRAINT "v1_tournament_groups_tournament_id_fkey" FOREIGN KEY (tournament_id) REFERENCES v1_tournaments(id) ON UPDATE CASCADE ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v1_tournament_payments_confirmed_by_admin_user_id_fkey') THEN
    ALTER TABLE "v1_tournament_payments" ADD CONSTRAINT "v1_tournament_payments_confirmed_by_admin_user_id_fkey" FOREIGN KEY (confirmed_by_admin_user_id) REFERENCES v1_admin_users(id) ON UPDATE CASCADE ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v1_tournament_payments_registration_id_fkey') THEN
    ALTER TABLE "v1_tournament_payments" ADD CONSTRAINT "v1_tournament_payments_registration_id_fkey" FOREIGN KEY (registration_id) REFERENCES v1_tournament_registrations(id) ON UPDATE CASCADE ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v1_tournament_players_registration_id_fkey') THEN
    ALTER TABLE "v1_tournament_players" ADD CONSTRAINT "v1_tournament_players_registration_id_fkey" FOREIGN KEY (registration_id) REFERENCES v1_tournament_registrations(id) ON UPDATE CASCADE ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v1_tournament_players_user_id_fkey') THEN
    ALTER TABLE "v1_tournament_players" ADD CONSTRAINT "v1_tournament_players_user_id_fkey" FOREIGN KEY (user_id) REFERENCES v1_users(id) ON UPDATE CASCADE ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v1_tournament_registrations_applied_by_user_id_fkey') THEN
    ALTER TABLE "v1_tournament_registrations" ADD CONSTRAINT "v1_tournament_registrations_applied_by_user_id_fkey" FOREIGN KEY (applied_by_user_id) REFERENCES v1_users(id) ON UPDATE CASCADE ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v1_tournament_registrations_confirmed_by_admin_user_id_fkey') THEN
    ALTER TABLE "v1_tournament_registrations" ADD CONSTRAINT "v1_tournament_registrations_confirmed_by_admin_user_id_fkey" FOREIGN KEY (confirmed_by_admin_user_id) REFERENCES v1_admin_users(id) ON UPDATE CASCADE ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v1_tournament_registrations_team_id_fkey') THEN
    ALTER TABLE "v1_tournament_registrations" ADD CONSTRAINT "v1_tournament_registrations_team_id_fkey" FOREIGN KEY (team_id) REFERENCES v1_teams(id) ON UPDATE CASCADE ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v1_tournament_registrations_tournament_id_fkey') THEN
    ALTER TABLE "v1_tournament_registrations" ADD CONSTRAINT "v1_tournament_registrations_tournament_id_fkey" FOREIGN KEY (tournament_id) REFERENCES v1_tournaments(id) ON UPDATE CASCADE ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v1_tournament_standings_group_id_fkey') THEN
    ALTER TABLE "v1_tournament_standings" ADD CONSTRAINT "v1_tournament_standings_group_id_fkey" FOREIGN KEY (group_id) REFERENCES v1_tournament_groups(id) ON UPDATE CASCADE ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v1_tournament_standings_registration_id_fkey') THEN
    ALTER TABLE "v1_tournament_standings" ADD CONSTRAINT "v1_tournament_standings_registration_id_fkey" FOREIGN KEY (registration_id) REFERENCES v1_tournament_registrations(id) ON UPDATE CASCADE ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v1_tournaments_created_by_admin_user_id_fkey') THEN
    ALTER TABLE "v1_tournaments" ADD CONSTRAINT "v1_tournaments_created_by_admin_user_id_fkey" FOREIGN KEY (created_by_admin_user_id) REFERENCES v1_admin_users(id) ON UPDATE CASCADE ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v1_tournaments_sport_id_fkey') THEN
    ALTER TABLE "v1_tournaments" ADD CONSTRAINT "v1_tournaments_sport_id_fkey" FOREIGN KEY (sport_id) REFERENCES v1_sports(id) ON UPDATE CASCADE ON DELETE RESTRICT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "v1_search_histories_session_key_searched_at_idx" ON "v1_search_histories" USING btree (session_key, searched_at);
CREATE INDEX IF NOT EXISTS "v1_search_histories_user_id_searched_at_idx" ON "v1_search_histories" USING btree (user_id, searched_at);
CREATE INDEX IF NOT EXISTS "v1_tournament_announcements_tournament_id_published_at_idx" ON "v1_tournament_announcements" USING btree (tournament_id, published_at);
CREATE UNIQUE INDEX IF NOT EXISTS "v1_tournament_fixture_results_fixture_id_key" ON "v1_tournament_fixture_results" USING btree (fixture_id);
CREATE INDEX IF NOT EXISTS "v1_tournament_fixtures_group_id_idx" ON "v1_tournament_fixtures" USING btree (group_id);
CREATE INDEX IF NOT EXISTS "v1_tournament_fixtures_parent_fixture_id_idx" ON "v1_tournament_fixtures" USING btree (parent_fixture_id);
CREATE INDEX IF NOT EXISTS "v1_tournament_fixtures_tournament_id_round_fixture_number_idx" ON "v1_tournament_fixtures" USING btree (tournament_id, round, fixture_number);
CREATE UNIQUE INDEX IF NOT EXISTS "v1_tournament_group_teams_group_id_registration_id_key" ON "v1_tournament_group_teams" USING btree (group_id, registration_id);
CREATE INDEX IF NOT EXISTS "v1_tournament_group_teams_registration_id_idx" ON "v1_tournament_group_teams" USING btree (registration_id);
CREATE INDEX IF NOT EXISTS "v1_tournament_groups_tournament_id_phase_sort_order_idx" ON "v1_tournament_groups" USING btree (tournament_id, phase, sort_order);
CREATE INDEX IF NOT EXISTS "v1_tournament_payments_provider_tx_id_idx" ON "v1_tournament_payments" USING btree (provider_tx_id);
CREATE UNIQUE INDEX IF NOT EXISTS "v1_tournament_payments_registration_id_key" ON "v1_tournament_payments" USING btree (registration_id);
CREATE INDEX IF NOT EXISTS "v1_tournament_payments_status_idx" ON "v1_tournament_payments" USING btree (status);
CREATE INDEX IF NOT EXISTS "v1_tournament_players_eligibility_status_idx" ON "v1_tournament_players" USING btree (eligibility_status);
CREATE INDEX IF NOT EXISTS "v1_tournament_players_registration_id_removed_at_idx" ON "v1_tournament_players" USING btree (registration_id, removed_at);
CREATE UNIQUE INDEX IF NOT EXISTS "v1_tournament_players_registration_id_user_id_key" ON "v1_tournament_players" USING btree (registration_id, user_id);
CREATE INDEX IF NOT EXISTS "v1_tournament_players_user_id_idx" ON "v1_tournament_players" USING btree (user_id);
CREATE INDEX IF NOT EXISTS "v1_tournament_registrations_applied_by_user_id_idx" ON "v1_tournament_registrations" USING btree (applied_by_user_id);
CREATE INDEX IF NOT EXISTS "v1_tournament_registrations_team_id_idx" ON "v1_tournament_registrations" USING btree (team_id);
CREATE INDEX IF NOT EXISTS "v1_tournament_registrations_tournament_id_status_idx" ON "v1_tournament_registrations" USING btree (tournament_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS "v1_tournament_registrations_tournament_id_team_id_key" ON "v1_tournament_registrations" USING btree (tournament_id, team_id);
CREATE INDEX IF NOT EXISTS "v1_tournament_standings_group_id_position_idx" ON "v1_tournament_standings" USING btree (group_id, "position");
CREATE UNIQUE INDEX IF NOT EXISTS "v1_tournament_standings_group_id_registration_id_key" ON "v1_tournament_standings" USING btree (group_id, registration_id);
CREATE INDEX IF NOT EXISTS "v1_tournaments_sport_id_status_idx" ON "v1_tournaments" USING btree (sport_id, status);
CREATE INDEX IF NOT EXISTS "v1_tournaments_status_scheduled_at_idx" ON "v1_tournaments" USING btree (status, scheduled_at);
