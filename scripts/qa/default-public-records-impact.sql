-- Read-only aggregate impact preview. Run against the intended deployment DB
-- immediately before promotion; counts are a snapshot, not a migration input.
-- No account identifiers, names, contact details or credentials are returned.
-- Cohort matches 20261023120000_default_public_user_records; records mirror the
-- shared public-user-records eligibility (current official canonical results,
-- public competitions and latest participant privacy override).
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '20s';
WITH users AS (
 SELECT u.id, u.account_status, u.deleted_at, u.onboarding_status, c.state,
   (u.account_status = 'active' AND u.deleted_at IS NULL AND u.onboarding_status IN
    ('signup_done','sport_done','level_done','region_done','completed','deferred','social_profile_deferred')) AS usable
 FROM v1_users u LEFT JOIN v1_user_record_consents c ON c.user_id = u.id
), targets AS (SELECT id FROM users WHERE usable AND state IS NULL),
linked AS (
 SELECT l.* FROM v1_participant_identity_link_current l JOIN targets t ON t.id=l.user_id
), records AS (
 SELECT l.user_id, r.id, rev.game_id, r.goals, r.assists,
   (tm.tournament_id IS NOT NULL OR tm.league_id IS NOT NULL) AS competitive
 FROM linked l
 JOIN v1_game_result_participants r ON r.participant_id=l.participant_id
 JOIN v1_game_result_revisions rev ON rev.id=r.result_revision_id AND rev.official_at IS NOT NULL
 JOIN v1_games g ON g.id=rev.game_id AND g.current_official_revision_id=rev.id AND g.source_type='TEAM_MATCH'
 JOIN v1_team_matches tm ON tm.id=g.team_match_id
 LEFT JOIN v1_tournaments tournament ON tournament.id=tm.tournament_id
 LEFT JOIN v1_tournaments league ON league.id=tm.league_id
 LEFT JOIN LATERAL (
   SELECT s.state FROM v1_participant_consent_snapshots s WHERE s.link_id=l.link_id ORDER BY s.consent_version DESC LIMIT 1
 ) snapshot ON true
 WHERE (tm.tournament_id IS NULL OR tournament.is_public)
   AND (tm.league_id IS NULL OR league.is_public)
   AND snapshot.state IS DISTINCT FROM 'REVOKED'::"V1ConsentState"
), awards AS (
 SELECT a.recipient_user_id AS user_id, a.id FROM v1_tournament_awards a
 JOIN targets t ON t.id=a.recipient_user_id JOIN v1_tournaments tournament ON tournament.id=a.tournament_id
 WHERE tournament.is_public
), content_users AS (SELECT user_id FROM records UNION SELECT user_id FROM awards)
SELECT jsonb_build_object(
 'snapshot_utc', to_char(NOW() AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS'),
 'transaction_read_only', current_setting('transaction_read_only'),
 'total_users', (SELECT count(*) FROM users),
 'usable_members', (SELECT count(*) FROM users WHERE usable),
 'usable_already_public', (SELECT count(*) FROM users WHERE usable AND state='GRANTED'),
 'usable_explicit_private', (SELECT count(*) FROM users WHERE usable AND state='REVOKED'),
 'public_default_targets', (SELECT count(*) FROM targets),
 'all_explicit_private', (SELECT count(*) FROM users WHERE state='REVOKED'),
 'excluded_unconfigured', (SELECT count(*) FROM users WHERE NOT usable AND state IS NULL),
 'targets_by_onboarding', (SELECT jsonb_object_agg(onboarding_status,n) FROM
    (SELECT onboarding_status,count(*) n FROM users WHERE usable AND state IS NULL GROUP BY onboarding_status) grouped),
 'realname_on_targets_with_public_records', (SELECT count(DISTINCT t.id) FROM targets t JOIN v1_user_profiles p ON p.user_id=t.id JOIN records r ON r.user_id=t.id WHERE p.tournament_real_name_visible),
 'realname_on_targets_with_public_awards', (SELECT count(DISTINCT t.id) FROM targets t JOIN v1_user_profiles p ON p.user_id=t.id JOIN awards a ON a.user_id=t.id WHERE p.tournament_real_name_visible),
 'realname_on_targets_with_any_public_content', (SELECT count(DISTINCT t.id) FROM targets t JOIN v1_user_profiles p ON p.user_id=t.id JOIN content_users c ON c.user_id=t.id WHERE p.tournament_real_name_visible),
 'targets_with_realname_setting_on', (SELECT count(*) FROM targets t JOIN v1_user_profiles p ON p.user_id=t.id WHERE p.tournament_real_name_visible),
 'targets_with_identity_links', (SELECT count(DISTINCT user_id) FROM linked),
 'targets_with_public_records', (SELECT count(DISTINCT user_id) FROM records),
 'public_record_participations', (SELECT count(*) FROM records),
 'distinct_official_games', (SELECT count(DISTINCT game_id) FROM records),
 'goals_in_new_public_records', (SELECT coalesce(sum(goals),0) FROM records),
 'assists_in_new_public_records', (SELECT coalesce(sum(assists),0) FROM records),
 'targets_with_competitive_goals_or_assists', (SELECT count(DISTINCT user_id) FROM records WHERE competitive AND (goals>0 OR assists>0)),
 'targets_with_public_awards', (SELECT count(DISTINCT user_id) FROM awards),
 'public_award_rows', (SELECT count(*) FROM awards),
 'targets_with_any_public_content', (SELECT count(*) FROM content_users),
 'targets_without_current_public_content', (SELECT count(*) FROM targets WHERE id NOT IN (SELECT user_id FROM content_users))
) AS report;
COMMIT;
