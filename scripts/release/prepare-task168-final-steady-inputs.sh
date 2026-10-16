#!/usr/bin/env bash
set -Eeuo pipefail

# Task 168 M11 converged (post-StageB): binds the release manifest to the
# final post-retirement schema and the M11 migration file, exactly the way
# prepare-task168-stage-manifest-inputs.sh bound the StageA release to the
# r5 schema and v7 archive. Unlike that script this one does not freeze a
# fixed migration list — deploy/task168-final-steady-migrate.sh reads the
# candidate source tree directly against the live DB ledger at deploy time
# (see its L1-L4 check), so migrations after M11 do not require touching
# this binder.

# Task 172 adds shared match record/history tables; M11 remains immutable.
# 2026-09-26 adds nullable v1_auth_identities.provider_refresh_token_ciphertext (Apple revoke).
# 2026-09-27 adds v1_site_info_settings (singleton) and additive v1_inquiries guest-retention/purge columns + categories.
# 2026-09-28 Task 179 adds v1_game_roster_adjustments and v1_team_member_unavailabilities.
# 2026-10-01 Task 181: additive chat image message (enum value image + nullable v1_chat_messages.attachment_asset_id FK).
# 2026-10-01 Task 181 ②: additive chat share card (enum value share + nullable v1_chat_messages.share_card JSONB).
# 2026-10-01 Task 181 ③: additive chat file message (enum values file + nullable v1_upload_assets.original_name).
# 2026-10-01 Task 180 G12 adds v1_team_invite_links.
# 2026-10-01 Task 180 W4-V8: v1_team_invitations unique (team, user) -> pending-only partial unique + plain index.
# 2026-10-07: additive v1_tournaments.is_public with its own migration; M11 remains unchanged.
# 2026-10-10: additive place snapshot columns on v1_matches/v1_team_matches/v1_tournaments (20261010090000_v1_place_snapshots); M11 remains unchanged.
# 2026-10-11: additive v1_tournament_registrations.admin_cancel_reason/cancel_outcome (20261011090000_v1_registration_cancel_outcome); M11 remains unchanged.
# 2026-10-14 Task 20261082: additive per-game goalkeeper roles (20261014180000_v1_game_roster_goalkeepers); M11 remains unchanged.
schema=apps/v1_api/prisma/schema.prisma
m11=apps/v1_api/prisma/migrations/20260911090000_retire_tournament_fixture_tables/migration.sql
[[ -f "$schema" && -f "$m11" ]] || { echo 'Task168 final-policy source inputs missing' >&2; exit 1; }

schema_sha="$(sha256sum "$schema" | awk '{print $1}')"
m11_sha="$(sha256sum "$m11" | awk '{print $1}')"
# 2026-10-13: V1Tournament.maxPlayers nullable + additive planned_fixture_count (20261013100000_league_roster_limit_planned_fixtures); M11 remains unchanged.
# 2026-10-14: additive V1TournamentField.placeSnapshot with migration/backfill (Task 20261082).
# 2026-10-15 MD-QA #145: additive nullable V1Tournament.maxTeams (20261015180000_v1_league_optional_team_capacity); M11 remains unchanged.
# 2026-10-16: nullable V1TournamentSlot.byeSortOrder (20261016090000_bye_side_layout); M11 remains unchanged.
[[ "$schema_sha" == 8776cccbf35b17cca2bd962cd44fe09fa98542c0395304b109e2a00f04684d0b \
  && "$m11_sha" == 08eac7347cbb10fcc4ef87d31d63bd9516d5bfda281dcf5730c4f0a1985d9323 ]] \
  || { echo 'Task168 final-policy schema/M11 digest mismatch' >&2; exit 1; }

printf 'TASK168_SCHEMA_SHA256=%s\nTASK168_M11_SHA256=%s\n' "$schema_sha" "$m11_sha" >> "$GITHUB_ENV"
