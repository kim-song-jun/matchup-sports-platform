import { Prisma, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const execute = process.argv.includes('--execute');
const confirmed = process.argv.includes('--confirm=delete-v1-demo-data');

const setupCandidates = `
CREATE TEMP TABLE cleanup_seed_users ON COMMIT DROP AS
  SELECT id FROM v1_users WHERE id::text LIKE '00000000-%' OR email LIKE '%@teameet.v1';
CREATE TEMP TABLE cleanup_seed_admin_users ON COMMIT DROP AS
  SELECT id FROM v1_admin_users WHERE id::text LIKE '00000000-%' OR user_id IN (SELECT id FROM cleanup_seed_users);
CREATE TEMP TABLE cleanup_seed_teams ON COMMIT DROP AS
  SELECT id FROM v1_teams WHERE id::text LIKE '00000000-%' OR owner_user_id IN (SELECT id FROM cleanup_seed_users);
CREATE TEMP TABLE cleanup_seed_matches ON COMMIT DROP AS
  SELECT id FROM v1_matches WHERE id::text LIKE '00000000-%' OR host_user_id IN (SELECT id FROM cleanup_seed_users);
CREATE TEMP TABLE cleanup_seed_registrations ON COMMIT DROP AS
  SELECT id FROM v1_tournament_registrations
  WHERE id::text LIKE '00000000-%' OR team_id IN (SELECT id FROM cleanup_seed_teams)
     OR applied_by_user_id IN (SELECT id FROM cleanup_seed_users)
     OR confirmed_by_admin_user_id IN (SELECT id FROM cleanup_seed_admin_users);
ALTER TABLE cleanup_seed_registrations ADD PRIMARY KEY (id);
CREATE TEMP TABLE cleanup_seed_tournaments ON COMMIT DROP AS
  SELECT DISTINCT t.id FROM v1_tournaments t
  LEFT JOIN v1_tournament_registrations r ON r.tournament_id = t.id
  WHERE t.id::text LIKE '00000000-%' OR t.created_by_admin_user_id IN (SELECT id FROM cleanup_seed_admin_users)
     OR r.id IN (SELECT id FROM cleanup_seed_registrations);
ALTER TABLE cleanup_seed_tournaments ADD PRIMARY KEY (id);
CREATE TEMP TABLE cleanup_seed_team_matches ON COMMIT DROP AS
  SELECT id FROM v1_team_matches
  WHERE id::text LIKE '00000000-%'
     OR tournament_id IN (SELECT id FROM cleanup_seed_tournaments)
     OR league_id IN (SELECT id FROM cleanup_seed_tournaments)
     OR created_by_user_id IN (SELECT id FROM cleanup_seed_users)
     OR host_team_id IN (SELECT id FROM cleanup_seed_teams)
     OR approved_applicant_team_id IN (SELECT id FROM cleanup_seed_teams);
ALTER TABLE cleanup_seed_team_matches ADD PRIMARY KEY (id);
INSERT INTO cleanup_seed_tournaments
  SELECT DISTINCT tournament_id FROM v1_tournament_match_details
  WHERE team_match_id IN (SELECT id FROM cleanup_seed_team_matches) ON CONFLICT DO NOTHING;
INSERT INTO cleanup_seed_team_matches
  SELECT id FROM v1_team_matches
  WHERE tournament_id IN (SELECT id FROM cleanup_seed_tournaments)
     OR league_id IN (SELECT id FROM cleanup_seed_tournaments) ON CONFLICT DO NOTHING;
CREATE TEMP TABLE cleanup_seed_chat_rooms ON COMMIT DROP AS
  SELECT DISTINCT r.id FROM v1_chat_rooms r
  LEFT JOIN v1_chat_room_participants p ON p.chat_room_id = r.id
  LEFT JOIN v1_chat_messages m ON m.chat_room_id = r.id
  WHERE r.id::text LIKE '00000000-%' OR r.match_id IN (SELECT id FROM cleanup_seed_matches)
     OR r.team_id IN (SELECT id FROM cleanup_seed_teams) OR r.team_match_id IN (SELECT id FROM cleanup_seed_team_matches)
     OR p.user_id IN (SELECT id FROM cleanup_seed_users) OR m.sender_user_id IN (SELECT id FROM cleanup_seed_users);
CREATE TEMP TABLE cleanup_seed_games ON COMMIT DROP AS
  SELECT id FROM v1_games WHERE id::text LIKE '00000000-%' OR team_match_id IN (SELECT id FROM cleanup_seed_team_matches);
INSERT INTO cleanup_seed_registrations
  SELECT id FROM v1_tournament_registrations WHERE tournament_id IN (SELECT id FROM cleanup_seed_tournaments)
  ON CONFLICT DO NOTHING;
CREATE TEMP TABLE cleanup_protected_games ON COMMIT DROP AS
  SELECT DISTINCT g.id FROM v1_games g WHERE g.id IN (SELECT id FROM cleanup_seed_games)
    AND (g.current_official_revision_id IS NOT NULL
      OR EXISTS (SELECT 1 FROM v1_game_official_facts f WHERE f.game_id = g.id)
      OR EXISTS (SELECT 1 FROM v1_game_official_result_cache c WHERE c.game_id = g.id)
      OR EXISTS (SELECT 1 FROM v1_tournament_result_lineages l WHERE l.game_id = g.id)
      OR EXISTS (SELECT 1 FROM v1_operation_audits a WHERE a.team_match_id = g.team_match_id OR a.resource_id = g.id OR a.resource_id = g.current_official_revision_id)
      OR EXISTS (SELECT 1 FROM v1_game_result_revisions r WHERE r.game_id = g.id AND r.state::text <> 'DRAFT')
      OR EXISTS (SELECT 1 FROM v1_team_record_facts f WHERE f.game_id = g.id)
      OR EXISTS (SELECT 1 FROM v1_game_participants p WHERE p.game_id = g.id AND (EXISTS (SELECT 1 FROM v1_participant_identity_link_events e WHERE e.participant_id = p.id) OR EXISTS (SELECT 1 FROM v1_participant_consent_snapshots c WHERE c.participant_id = p.id) OR EXISTS (SELECT 1 FROM v1_participant_identity_link_current c WHERE c.participant_id = p.id))));
CREATE TEMP TABLE cleanup_protected_team_matches ON COMMIT DROP AS
  SELECT DISTINCT tm.id FROM v1_team_matches tm WHERE tm.id IN (SELECT id FROM cleanup_seed_team_matches)
    AND (EXISTS (SELECT 1 FROM cleanup_protected_games g WHERE g.id IN (SELECT id FROM v1_games WHERE team_match_id = tm.id))
      OR EXISTS (SELECT 1 FROM v1_tournament_result_lineages l WHERE l.team_match_id = tm.id)
      OR EXISTS (SELECT 1 FROM v1_operation_audits a WHERE a.team_match_id = tm.id OR a.resource_id = tm.id));
CREATE TEMP TABLE cleanup_protected_tournaments ON COMMIT DROP AS
  SELECT DISTINCT t.id FROM v1_tournaments t WHERE t.id IN (SELECT id FROM cleanup_seed_tournaments)
    AND (EXISTS (SELECT 1 FROM v1_operation_audits a WHERE a.tournament_id = t.id OR a.resource_id = t.id)
      OR EXISTS (SELECT 1 FROM v1_tournament_result_lineages l WHERE l.tournament_id = t.id)
      OR EXISTS (SELECT 1 FROM v1_tournament_match_details d WHERE d.tournament_id = t.id AND d.team_match_id IN (SELECT id FROM cleanup_protected_team_matches)));
CREATE TEMP TABLE cleanup_protected_teams ON COMMIT DROP AS
  SELECT DISTINCT s.team_id AS id FROM v1_tournament_registrations s
  WHERE s.id IN (SELECT id FROM cleanup_seed_registrations)
    AND s.tournament_id IN (SELECT id FROM cleanup_protected_tournaments)
  UNION SELECT DISTINCT team_id FROM v1_game_sides WHERE game_id IN (SELECT id FROM cleanup_protected_games) AND team_id IS NOT NULL;
CREATE TEMP TABLE cleanup_protected_users ON COMMIT DROP AS
  SELECT DISTINCT p.user_id AS id FROM v1_game_participants p
  WHERE p.game_id IN (SELECT id FROM cleanup_protected_games) AND p.user_id IS NOT NULL
  UNION SELECT DISTINCT a.actor_user_id FROM v1_operation_audits a
  WHERE a.actor_user_id IN (SELECT id FROM cleanup_seed_users)
  UNION SELECT DISTINCT owner_user_id FROM v1_teams
  WHERE id IN (SELECT id FROM cleanup_protected_teams) AND owner_user_id IS NOT NULL
  UNION SELECT DISTINCT m.user_id FROM v1_team_memberships m
  WHERE m.team_id IN (SELECT id FROM cleanup_protected_teams)
  UNION SELECT DISTINCT p.user_id FROM v1_tournament_players p
  JOIN v1_tournament_registrations r ON r.id = p.registration_id
  WHERE r.team_id IN (SELECT id FROM cleanup_protected_teams);
`;

const countSql = `SELECT json_build_object(
  'users',(SELECT count(*) FROM cleanup_seed_users),'teams',(SELECT count(*) FROM cleanup_seed_teams),'matches',(SELECT count(*) FROM cleanup_seed_matches),
  'tournaments',(SELECT count(*) FROM cleanup_seed_tournaments),'teamMatches',(SELECT count(*) FROM cleanup_seed_team_matches),
  'games',(SELECT count(*) FROM cleanup_seed_games),'registrations',(SELECT count(*) FROM cleanup_seed_registrations),
  'protectedUsers',(SELECT count(*) FROM cleanup_protected_users),'protectedTeams',(SELECT count(*) FROM cleanup_protected_teams),
  'protectedTournaments',(SELECT count(*) FROM cleanup_protected_tournaments),'protectedTeamMatches',(SELECT count(*) FROM cleanup_protected_team_matches),
  'protectedGames',(SELECT count(*) FROM cleanup_protected_games)) AS counts`;
const idsSql = `SELECT json_build_object(
  'protectedUsers',COALESCE((SELECT json_agg(id ORDER BY id) FROM cleanup_protected_users),'[]'::json),
  'protectedTeams',COALESCE((SELECT json_agg(id ORDER BY id) FROM cleanup_protected_teams),'[]'::json),
  'protectedTournaments',COALESCE((SELECT json_agg(id ORDER BY id) FROM cleanup_protected_tournaments),'[]'::json),
  'protectedTeamMatches',COALESCE((SELECT json_agg(id ORDER BY id) FROM cleanup_protected_team_matches),'[]'::json),
  'protectedGames',COALESCE((SELECT json_agg(id ORDER BY id) FROM cleanup_protected_games),'[]'::json)) AS ids`;
const deletionSql = [
  `DELETE FROM v1_outbox_events WHERE aggregate_id IN (SELECT id FROM cleanup_seed_games) OR aggregate_id IN (SELECT id FROM cleanup_seed_team_matches) OR aggregate_id IN (SELECT id FROM cleanup_seed_tournaments)`,
  `DELETE FROM v1_idempotency_records WHERE resource_id IN (SELECT id FROM cleanup_seed_games) OR resource_id IN (SELECT id FROM cleanup_seed_team_matches) OR resource_id IN (SELECT id FROM cleanup_seed_tournaments)`,
  `DELETE FROM v1_projection_watermarks WHERE entity_id IN (SELECT id FROM cleanup_seed_games) OR entity_id IN (SELECT id FROM cleanup_seed_team_matches) OR entity_id IN (SELECT id FROM cleanup_seed_tournaments)`,
  `DELETE FROM v1_game_events WHERE game_id IN (SELECT id FROM cleanup_seed_games)`,
  `DELETE FROM v1_participant_identity_link_current WHERE participant_id IN (SELECT id FROM v1_game_participants WHERE game_id IN (SELECT id FROM cleanup_seed_games))`,
  `DELETE FROM v1_game_result_decisions WHERE revision_id IN (SELECT id FROM v1_game_result_revisions WHERE game_id IN (SELECT id FROM cleanup_seed_games))`,
  `DELETE FROM v1_game_result_participants WHERE result_revision_id IN (SELECT id FROM v1_game_result_revisions WHERE game_id IN (SELECT id FROM cleanup_seed_games))`,
  `DELETE FROM v1_result_escalations WHERE result_revision_id IN (SELECT id FROM v1_game_result_revisions WHERE game_id IN (SELECT id FROM cleanup_seed_games))`,
  `DELETE FROM v1_game_result_revisions WHERE game_id IN (SELECT id FROM cleanup_seed_games)`,
  `DELETE FROM v1_team_tactics_board_entries WHERE board_id IN (SELECT id FROM v1_team_tactics_boards WHERE game_id IN (SELECT id FROM cleanup_seed_games))`,
  `DELETE FROM v1_team_tactics_boards WHERE game_id IN (SELECT id FROM cleanup_seed_games)`,
  `DELETE FROM v1_game_participants WHERE game_id IN (SELECT id FROM cleanup_seed_games)`,
  `DELETE FROM v1_game_lineups WHERE game_id IN (SELECT id FROM cleanup_seed_games)`,
  `DELETE FROM v1_game_periods WHERE game_id IN (SELECT id FROM cleanup_seed_games)`,
  `DELETE FROM v1_game_sides WHERE game_id IN (SELECT id FROM cleanup_seed_games)`,
  `DELETE FROM v1_game_visibility_policies WHERE game_id IN (SELECT id FROM cleanup_seed_games)`,
  `DELETE FROM v1_games WHERE id IN (SELECT id FROM cleanup_seed_games)`,
  `DELETE FROM v1_tournament_awards WHERE tournament_id IN (SELECT id FROM cleanup_seed_tournaments)`,
  `DELETE FROM v1_tournament_reviews WHERE tournament_id IN (SELECT id FROM cleanup_seed_tournaments)`,
  `DELETE FROM v1_post_event_review_tags WHERE review_id IN (SELECT id FROM v1_post_event_reviews WHERE id::text LIKE '00000000-%' OR reviewer_user_id IN (SELECT id FROM cleanup_seed_users) OR target_user_id IN (SELECT id FROM cleanup_seed_users) OR reviewer_team_id IN (SELECT id FROM cleanup_seed_teams) OR target_team_id IN (SELECT id FROM cleanup_seed_teams) OR source_id LIKE '00000000-%' OR source_id IN (SELECT id FROM cleanup_seed_team_matches))`,
  `DELETE FROM v1_post_event_review_metric_scores WHERE review_id IN (SELECT id FROM v1_post_event_reviews WHERE id::text LIKE '00000000-%' OR reviewer_user_id IN (SELECT id FROM cleanup_seed_users) OR target_user_id IN (SELECT id FROM cleanup_seed_users) OR reviewer_team_id IN (SELECT id FROM cleanup_seed_teams) OR target_team_id IN (SELECT id FROM cleanup_seed_teams) OR source_id LIKE '00000000-%' OR source_id IN (SELECT id FROM cleanup_seed_team_matches))`,
  `DELETE FROM v1_post_event_review_risk_flags WHERE review_id IN (SELECT id FROM v1_post_event_reviews WHERE id::text LIKE '00000000-%' OR reviewer_user_id IN (SELECT id FROM cleanup_seed_users) OR target_user_id IN (SELECT id FROM cleanup_seed_users) OR reviewer_team_id IN (SELECT id FROM cleanup_seed_teams) OR target_team_id IN (SELECT id FROM cleanup_seed_teams) OR source_id LIKE '00000000-%' OR source_id IN (SELECT id FROM cleanup_seed_team_matches))`,
  `DELETE FROM v1_post_event_reviews WHERE id::text LIKE '00000000-%' OR reviewer_user_id IN (SELECT id FROM cleanup_seed_users) OR target_user_id IN (SELECT id FROM cleanup_seed_users) OR reviewer_team_id IN (SELECT id FROM cleanup_seed_teams) OR target_team_id IN (SELECT id FROM cleanup_seed_teams) OR source_id LIKE '00000000-%' OR source_id IN (SELECT id FROM cleanup_seed_team_matches)`,
  `DELETE FROM v1_tournament_announcements WHERE tournament_id IN (SELECT id FROM cleanup_seed_tournaments)`,
  `DELETE FROM v1_tournament_sponsors WHERE tournament_id IN (SELECT id FROM cleanup_seed_tournaments)`,
  `DELETE FROM v1_tournament_popups WHERE tournament_id IN (SELECT id FROM cleanup_seed_tournaments)`,
  `DELETE FROM v1_tournament_campaigns WHERE tournament_id IN (SELECT id FROM cleanup_seed_tournaments)`,
  `DELETE FROM v1_tournament_payments WHERE registration_id IN (SELECT id FROM cleanup_seed_registrations)`,
  `DELETE FROM v1_tournament_players WHERE registration_id IN (SELECT id FROM cleanup_seed_registrations) OR user_id IN (SELECT id FROM cleanup_seed_users)`,
  `DELETE FROM v1_tournament_group_teams WHERE group_id IN (SELECT id FROM v1_tournament_groups WHERE tournament_id IN (SELECT id FROM cleanup_seed_tournaments)) OR registration_id IN (SELECT id FROM cleanup_seed_registrations)`,
  `DELETE FROM v1_tournament_standings WHERE group_id IN (SELECT id FROM v1_tournament_groups WHERE tournament_id IN (SELECT id FROM cleanup_seed_tournaments)) OR registration_id IN (SELECT id FROM cleanup_seed_registrations)`,
  `DELETE FROM v1_tournament_overall_standings WHERE registration_id IN (SELECT id FROM cleanup_seed_registrations)`,
  `DELETE FROM v1_tournament_match_advancement_edges WHERE tournament_id IN (SELECT id FROM cleanup_seed_tournaments)`,
  `DELETE FROM v1_tournament_match_details WHERE tournament_id IN (SELECT id FROM cleanup_seed_tournaments)`,
  `DELETE FROM v1_tournament_staff_fixture_scopes WHERE assignment_id IN (SELECT id FROM v1_tournament_staff_assignments WHERE tournament_id IN (SELECT id FROM cleanup_seed_tournaments))`,
  `DELETE FROM v1_tournament_staff_assignments WHERE tournament_id IN (SELECT id FROM cleanup_seed_tournaments)`,
  `DELETE FROM v1_chat_room_participants WHERE chat_room_id IN (SELECT id FROM cleanup_seed_chat_rooms) OR user_id IN (SELECT id FROM cleanup_seed_users)`,
  `DELETE FROM v1_chat_messages WHERE chat_room_id IN (SELECT id FROM cleanup_seed_chat_rooms) OR sender_user_id IN (SELECT id FROM cleanup_seed_users)`,
  `DELETE FROM v1_chat_rooms WHERE id IN (SELECT id FROM cleanup_seed_chat_rooms)`,
  `DELETE FROM v1_notifications WHERE id::text LIKE '00000000-%' OR recipient_user_id IN (SELECT id FROM cleanup_seed_users) OR target_id LIKE '00000000-%' OR target_id IN (SELECT id FROM cleanup_seed_games) OR target_id IN (SELECT id FROM cleanup_seed_team_matches) OR target_id IN (SELECT id FROM cleanup_seed_tournaments)`,
  `DELETE FROM v1_notification_preferences WHERE user_id IN (SELECT id FROM cleanup_seed_users)`,
  `DELETE FROM v1_search_histories WHERE user_id IN (SELECT id FROM cleanup_seed_users)`,
  `DELETE FROM v1_user_reputation_summaries WHERE user_id IN (SELECT id FROM cleanup_seed_users) OR source_label LIKE 'seed%'`,
  `DELETE FROM v1_user_regions WHERE user_id IN (SELECT id FROM cleanup_seed_users)`,
  `DELETE FROM v1_user_sport_preferences WHERE user_id IN (SELECT id FROM cleanup_seed_users)`,
  `DELETE FROM v1_user_terms_consents WHERE user_id IN (SELECT id FROM cleanup_seed_users)`,
  `DELETE FROM v1_user_onboarding_progress WHERE user_id IN (SELECT id FROM cleanup_seed_users)`,
  `DELETE FROM v1_tournament_groups WHERE tournament_id IN (SELECT id FROM cleanup_seed_tournaments)`,
  `DELETE FROM v1_tournament_registrations WHERE id IN (SELECT id FROM cleanup_seed_registrations)`,
  `DELETE FROM v1_team_match_videos WHERE team_match_id IN (SELECT id FROM cleanup_seed_team_matches)`,
  `DELETE FROM v1_team_match_applications WHERE id::text LIKE '00000000-%' OR team_match_id IN (SELECT id FROM cleanup_seed_team_matches) OR applicant_team_id IN (SELECT id FROM cleanup_seed_teams) OR applied_by_user_id IN (SELECT id FROM cleanup_seed_users) OR reviewed_by_user_id IN (SELECT id FROM cleanup_seed_users)`,
  `DELETE FROM v1_tournament_staff_fixture_scopes WHERE team_match_id IN (SELECT id FROM cleanup_seed_team_matches)`,
  `DELETE FROM v1_team_matches WHERE id IN (SELECT id FROM cleanup_seed_team_matches)`,
  `DELETE FROM v1_tournaments WHERE id IN (SELECT id FROM cleanup_seed_tournaments)`,
  `DELETE FROM v1_team_profiles WHERE team_id IN (SELECT id FROM cleanup_seed_teams)`,
  `DELETE FROM v1_team_trust_scores WHERE team_id IN (SELECT id FROM cleanup_seed_teams) OR source_label LIKE 'seed%'`,
  `DELETE FROM v1_team_memberships WHERE team_id IN (SELECT id FROM cleanup_seed_teams)`,
  `DELETE FROM v1_team_join_applications WHERE id::text LIKE '00000000-%' OR team_id IN (SELECT id FROM cleanup_seed_teams) OR applicant_user_id IN (SELECT id FROM cleanup_seed_users) OR reviewed_by_user_id IN (SELECT id FROM cleanup_seed_users)`,
  `DELETE FROM v1_team_invitations WHERE id::text LIKE '00000000-%' OR team_id IN (SELECT id FROM cleanup_seed_teams) OR invited_user_id IN (SELECT id FROM cleanup_seed_users) OR invited_by_user_id IN (SELECT id FROM cleanup_seed_users)`,
  `DELETE FROM v1_team_memberships WHERE id::text LIKE '00000000-%' OR team_id IN (SELECT id FROM cleanup_seed_teams) OR user_id IN (SELECT id FROM cleanup_seed_users) OR removed_by_user_id IN (SELECT id FROM cleanup_seed_users)`,
  `DELETE FROM v1_teams WHERE id IN (SELECT id FROM cleanup_seed_teams)`,
  `DELETE FROM v1_admin_users WHERE id IN (SELECT id FROM cleanup_seed_admin_users)`,
  `DELETE FROM v1_user_profiles WHERE user_id IN (SELECT id FROM cleanup_seed_users)`,
  `DELETE FROM v1_user_record_consents WHERE user_id IN (SELECT id FROM cleanup_seed_users)`,
  `DELETE FROM v1_auth_identities WHERE id::text LIKE '00000000-%' OR user_id IN (SELECT id FROM cleanup_seed_users) OR provider_user_key LIKE '%@teameet.v1' OR email LIKE '%@teameet.v1'`,
  `DELETE FROM v1_users WHERE id IN (SELECT id FROM cleanup_seed_users)`,
] as const;

const standardDeletionSql = [
  `DELETE FROM v1_match_participants WHERE id::text LIKE '00000000-%' OR match_id IN (SELECT id FROM cleanup_seed_matches) OR user_id IN (SELECT id FROM cleanup_seed_users)`,
  `DELETE FROM v1_match_applications WHERE id::text LIKE '00000000-%' OR match_id IN (SELECT id FROM cleanup_seed_matches) OR applicant_user_id IN (SELECT id FROM cleanup_seed_users) OR reviewed_by_user_id IN (SELECT id FROM cleanup_seed_users)`,
  `DELETE FROM v1_matches WHERE id IN (SELECT id FROM cleanup_seed_matches)`,
  `DELETE FROM v1_admin_action_logs WHERE id::text LIKE '00000000-%' OR admin_user_id IN (SELECT id FROM cleanup_seed_admin_users) OR target_id LIKE '00000000-%' OR target_id = 'seed-coverage'`,
  `DELETE FROM v1_status_change_logs WHERE id::text LIKE '00000000-%' OR actor_user_id IN (SELECT id FROM cleanup_seed_users) OR admin_user_id IN (SELECT id FROM cleanup_seed_admin_users) OR target_id LIKE '00000000-%' OR target_id = 'seed-coverage'`,
  `DELETE FROM v1_verification_tokens WHERE id::text LIKE '00000000-%' OR user_id IN (SELECT id FROM cleanup_seed_users)`,
  `DELETE FROM v1_push_subscriptions WHERE user_id IN (SELECT id FROM cleanup_seed_users)`,
  `DELETE FROM v1_push_devices WHERE user_id IN (SELECT id FROM cleanup_seed_users)`,
  `DELETE FROM v1_upload_assets WHERE owner_user_id IN (SELECT id FROM cleanup_seed_users)`,
  `DELETE FROM v1_team_lineup_preset_entries WHERE preset_id IN (SELECT id FROM v1_team_lineup_presets WHERE team_id IN (SELECT id FROM cleanup_seed_teams))`,
  `DELETE FROM v1_team_lineup_presets WHERE team_id IN (SELECT id FROM cleanup_seed_teams)`,
  `DELETE FROM v1_team_contact_blocks WHERE team_id IN (SELECT id FROM cleanup_seed_teams) OR blocked_team_id IN (SELECT id FROM cleanup_seed_teams) OR created_by_user_id IN (SELECT id FROM cleanup_seed_users)`,
  `DELETE FROM v1_team_contacts WHERE from_team_id IN (SELECT id FROM cleanup_seed_teams) OR to_team_id IN (SELECT id FROM cleanup_seed_teams) OR requested_by_user_id IN (SELECT id FROM cleanup_seed_users)`,
  `DELETE FROM v1_inquiry_replies WHERE inquiry_id IN (SELECT id FROM v1_inquiries WHERE user_id IN (SELECT id FROM cleanup_seed_users) OR reported_team_id IN (SELECT id FROM cleanup_seed_teams))`,
  `DELETE FROM v1_inquiries WHERE user_id IN (SELECT id FROM cleanup_seed_users) OR reported_team_id IN (SELECT id FROM cleanup_seed_teams)`,
  `DELETE FROM v1_web_push_failure_logs WHERE user_id IN (SELECT id FROM cleanup_seed_users) OR acknowledged_by IN (SELECT id FROM cleanup_seed_users)`,
  `DELETE FROM v1_notices WHERE id::text LIKE '00000000-%' OR body LIKE '%seed data%'`,
] as const;

const allDeletionSql = [...standardDeletionSql, ...deletionSql] as const;

type TargetKey = { targetId: number; tableName: string; where: string; columns: string[] };

function targetFromStatement(statement: string): { tableName: string; where: string } {
  const match = /^DELETE FROM ([a-z0-9_]+) WHERE (.+)$/s.exec(statement);
  if (!match) throw new Error(`Cleanup refused: unparseable trusted deletion target: ${statement}`);
  return { tableName: match[1], where: match[2] };
}

function quoteIdentifier(identifier: string): string {
  if (!/^[a-z_][a-z0-9_]*$/.test(identifier)) throw new Error(`Cleanup refused: invalid catalog identifier ${identifier}`);
  return `"${identifier}"`;
}

async function loadTargetKeys(tx: Prisma.TransactionClient): Promise<TargetKey[]> {
  const targets: TargetKey[] = [];
  for (const [targetId, statement] of allDeletionSql.entries()) {
    const { tableName, where } = targetFromStatement(statement);
    const columns = await tx.$queryRawUnsafe<Array<{ name: string }>>(`
      SELECT a.attname AS name
      FROM pg_index i
      JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
      WHERE i.indrelid = to_regclass('public.${tableName}') AND i.indisprimary
      ORDER BY array_position(i.indkey, a.attnum)
    `);
    if (columns.length === 0) throw new Error(`Cleanup refused: target table ${tableName} has no primary key`);
    targets.push({ targetId, tableName, where, columns: columns.map(({ name }) => name) });
  }
  return targets;
}

async function snapshotTargetKeys(tx: Prisma.TransactionClient): Promise<TargetKey[]> {
  const targets = await loadTargetKeys(tx);
  await tx.$executeRawUnsafe('CREATE TEMP TABLE cleanup_target_keys (target_id int NOT NULL, table_name text NOT NULL, pk jsonb NOT NULL) ON COMMIT DROP');
  for (const { targetId, tableName, where, columns } of targets) {
    const table = quoteIdentifier(tableName);
    const pk = columns.map((column) => `'${column}', to_jsonb(t.${quoteIdentifier(column)})`).join(', ');
    await tx.$executeRawUnsafe(
      `INSERT INTO cleanup_target_keys(target_id, table_name, pk) SELECT ${targetId}, '${tableName}', jsonb_build_object(${pk}) FROM ${table} t WHERE ${where}`,
    );
  }
  return targets;
}

async function assertNoResidualTargetKeys(tx: Prisma.TransactionClient, targets: TargetKey[]) {
  const residual: Array<{ table: string; rows: number }> = [];
  for (const { targetId, tableName, columns } of targets) {
    const table = quoteIdentifier(tableName);
    const pk = columns.map((column) => `'${column}', to_jsonb(t.${quoteIdentifier(column)})`).join(', ');
    const rows = await tx.$queryRawUnsafe<Array<{ count: number | bigint }>>(
      `SELECT COUNT(*)::int AS count FROM ${table} t JOIN cleanup_target_keys k ON k.target_id = ${targetId} AND k.pk = jsonb_build_object(${pk})`,
    );
    const count = Number(rows[0]?.count ?? 0);
    if (count > 0) residual.push({ table: tableName, rows: count });
  }
  if (residual.length > 0) throw new Error(`Cleanup refused: residual target rows remain: ${JSON.stringify(residual)}`);
  const [{ count: snapshotCount }] = await tx.$queryRawUnsafe<Array<{ count: number | bigint }>>('SELECT COUNT(*)::int AS count FROM cleanup_target_keys');
  const [{ count: distinctSnapshotCount }] = await tx.$queryRawUnsafe<Array<{ count: number | bigint }>>('SELECT COUNT(DISTINCT table_name || \'/\' || pk::text)::int AS count FROM cleanup_target_keys');
  console.log(JSON.stringify({ deletionStatementCount: targets.length, deletionTargetKeyCount: Number(snapshotCount ?? 0), distinctDeletionTargetKeyCount: Number(distinctSnapshotCount ?? 0), residualCheckedTargetKeyCount: Number(snapshotCount ?? 0), residualTargetCount: 0 }));
}

async function main() {
  if (execute && !confirmed) throw new Error('Missing --confirm=delete-v1-demo-data. Refusing to delete v1 demo data.');
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('LOCK TABLE v1_game_participants, v1_game_result_revisions, v1_game_official_facts, v1_game_official_result_cache, v1_team_record_facts, v1_tournament_result_lineages, v1_participant_identity_link_events, v1_participant_identity_link_current, v1_participant_consent_snapshots, v1_operation_audits IN SHARE MODE');
    for (const statement of setupCandidates.split(/;\s*(?=(?:CREATE|INSERT|ALTER)\s)/).map((sql) => sql.trim()).filter(Boolean)) {
      await tx.$executeRawUnsafe(statement);
    }
    const [countRow] = await tx.$queryRawUnsafe<Array<{ counts: unknown }>>(countSql);
    const [idsRow] = await tx.$queryRawUnsafe<Array<{ ids: unknown }>>(idsSql);
    console.log(JSON.stringify({ mode: execute ? 'execute' : 'dry-run', counts: countRow?.counts ?? {}, protectedIds: idsRow?.ids ?? {} }, null, 2));
    const counts = (countRow?.counts ?? {}) as Record<string, number | string>;
    const protectedCount = ['protectedUsers','protectedTeams','protectedTournaments','protectedTeamMatches','protectedGames'].some((key) => Number(counts[key] ?? 0) > 0);
    if (protectedCount) {
      if (execute) throw new Error('Cleanup refused: demo candidates are connected to immutable official, lineage, or audit history. No rows were changed.');
      console.log('executable=false: protected history is connected; dry-run completed without mutation.');
      return;
    }
    if (!execute) return;
    const targetKeys = await snapshotTargetKeys(tx);
    for (const statement of standardDeletionSql) await tx.$executeRawUnsafe(statement);
    for (const statement of deletionSql) await tx.$executeRawUnsafe(statement);
    await assertNoResidualTargetKeys(tx, targetKeys);
  });
  console.log(execute ? 'Deleted unprotected canonical v1 demo graph.' : 'Dry-run only. Re-run with --execute --confirm=delete-v1-demo-data after backup and review.');
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
