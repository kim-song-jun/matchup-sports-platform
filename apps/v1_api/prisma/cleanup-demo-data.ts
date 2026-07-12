import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const execute = process.argv.includes('--execute');
const confirmed = process.argv.includes('--confirm=delete-v1-demo-data');

const cte = `
WITH seed_users AS (
  SELECT id FROM v1_users
  WHERE id::text LIKE '00000000-%' OR email LIKE '%@teameet.v1'
),
seed_admin_users AS (
  SELECT id FROM v1_admin_users
  WHERE id::text LIKE '00000000-%' OR user_id IN (SELECT id FROM seed_users)
),
seed_teams AS (
  SELECT id FROM v1_teams
  WHERE id::text LIKE '00000000-%' OR owner_user_id IN (SELECT id FROM seed_users)
),
seed_matches AS (
  SELECT id FROM v1_matches
  WHERE id::text LIKE '00000000-%' OR host_user_id IN (SELECT id FROM seed_users)
),
seed_team_matches AS (
  SELECT id FROM v1_team_matches
  WHERE id::text LIKE '00000000-%'
     OR created_by_user_id IN (SELECT id FROM seed_users)
     OR host_team_id IN (SELECT id FROM seed_teams)
     OR approved_applicant_team_id IN (SELECT id FROM seed_teams)
),
seed_tournament_registrations AS (
  SELECT id FROM v1_tournament_registrations
  WHERE id::text LIKE '00000000-%'
     OR team_id IN (SELECT id FROM seed_teams)
     OR applied_by_user_id IN (SELECT id FROM seed_users)
     OR confirmed_by_admin_user_id IN (SELECT id FROM seed_admin_users)
),
seed_tournaments AS (
  SELECT DISTINCT t.id
  FROM v1_tournaments t
  LEFT JOIN v1_tournament_registrations r ON r.tournament_id = t.id
  WHERE t.id::text LIKE '00000000-%'
     OR t.created_by_admin_user_id IN (SELECT id FROM seed_admin_users)
     OR r.id IN (SELECT id FROM seed_tournament_registrations)
),
seed_chat_rooms AS (
  SELECT DISTINCT r.id
  FROM v1_chat_rooms r
  LEFT JOIN v1_chat_room_participants p ON p.chat_room_id = r.id
  LEFT JOIN v1_chat_messages m ON m.chat_room_id = r.id
  WHERE r.id::text LIKE '00000000-%'
     OR r.match_id IN (SELECT id FROM seed_matches)
     OR r.team_id IN (SELECT id FROM seed_teams)
     OR r.team_match_id IN (SELECT id FROM seed_team_matches)
     OR p.user_id IN (SELECT id FROM seed_users)
     OR m.sender_user_id IN (SELECT id FROM seed_users)
)
`;

const targets = [
  ['v1_tournament_fixture_results', `fixture_id IN (SELECT id FROM v1_tournament_fixtures WHERE tournament_id IN (SELECT id FROM seed_tournaments) OR home_registration_id IN (SELECT id FROM seed_tournament_registrations) OR away_registration_id IN (SELECT id FROM seed_tournament_registrations))`],
  ['v1_tournament_standings', `group_id IN (SELECT id FROM v1_tournament_groups WHERE tournament_id IN (SELECT id FROM seed_tournaments)) OR registration_id IN (SELECT id FROM seed_tournament_registrations)`],
  ['v1_tournament_group_teams', `group_id IN (SELECT id FROM v1_tournament_groups WHERE tournament_id IN (SELECT id FROM seed_tournaments)) OR registration_id IN (SELECT id FROM seed_tournament_registrations)`],
  ['v1_tournament_fixtures', `tournament_id IN (SELECT id FROM seed_tournaments) OR home_registration_id IN (SELECT id FROM seed_tournament_registrations) OR away_registration_id IN (SELECT id FROM seed_tournament_registrations)`],
  ['v1_tournament_payments', `registration_id IN (SELECT id FROM seed_tournament_registrations)`],
  ['v1_tournament_players', `registration_id IN (SELECT id FROM seed_tournament_registrations) OR user_id IN (SELECT id FROM seed_users)`],
  ['v1_tournament_registrations', `id IN (SELECT id FROM seed_tournament_registrations) OR tournament_id IN (SELECT id FROM seed_tournaments)`],
  ['v1_tournament_groups', `tournament_id IN (SELECT id FROM seed_tournaments)`],
  ['v1_tournament_announcements', `tournament_id IN (SELECT id FROM seed_tournaments)`],
  ['v1_tournaments', `id IN (SELECT id FROM seed_tournaments)`],
  ['v1_admin_action_logs', `id::text LIKE '00000000-%' OR admin_user_id IN (SELECT id FROM seed_admin_users) OR target_id LIKE '00000000-%' OR target_id = 'seed-coverage'`],
  ['v1_status_change_logs', `id::text LIKE '00000000-%' OR actor_user_id IN (SELECT id FROM seed_users) OR admin_user_id IN (SELECT id FROM seed_admin_users) OR target_id LIKE '00000000-%' OR target_id = 'seed-coverage'`],
  ['v1_notifications', `id::text LIKE '00000000-%' OR recipient_user_id IN (SELECT id FROM seed_users) OR target_id LIKE '00000000-%'`],
  ['v1_chat_room_participants', `chat_room_id IN (SELECT id FROM seed_chat_rooms) OR user_id IN (SELECT id FROM seed_users)`],
  ['v1_chat_messages', `id::text LIKE '00000000-%' OR chat_room_id IN (SELECT id FROM seed_chat_rooms) OR sender_user_id IN (SELECT id FROM seed_users)`],
  ['v1_chat_rooms', `id IN (SELECT id FROM seed_chat_rooms)`],
  ['v1_post_event_review_tags', `review_id IN (SELECT id FROM v1_post_event_reviews WHERE id::text LIKE '00000000-%' OR reviewer_user_id IN (SELECT id FROM seed_users) OR target_user_id IN (SELECT id FROM seed_users) OR reviewer_team_id IN (SELECT id FROM seed_teams) OR target_team_id IN (SELECT id FROM seed_teams) OR source_id LIKE '00000000-%')`],
  ['v1_post_event_reviews', `id::text LIKE '00000000-%' OR reviewer_user_id IN (SELECT id FROM seed_users) OR target_user_id IN (SELECT id FROM seed_users) OR reviewer_team_id IN (SELECT id FROM seed_teams) OR target_team_id IN (SELECT id FROM seed_teams) OR source_id LIKE '00000000-%'`],
  ['v1_team_match_applications', `id::text LIKE '00000000-%' OR team_match_id IN (SELECT id FROM seed_team_matches) OR applicant_team_id IN (SELECT id FROM seed_teams) OR applied_by_user_id IN (SELECT id FROM seed_users) OR reviewed_by_user_id IN (SELECT id FROM seed_users)`],
  ['v1_team_matches', `id IN (SELECT id FROM seed_team_matches)`],
  ['v1_team_invitations', `id::text LIKE '00000000-%' OR team_id IN (SELECT id FROM seed_teams) OR invited_user_id IN (SELECT id FROM seed_users) OR invited_by_user_id IN (SELECT id FROM seed_users)`],
  ['v1_team_join_applications', `id::text LIKE '00000000-%' OR team_id IN (SELECT id FROM seed_teams) OR applicant_user_id IN (SELECT id FROM seed_users) OR reviewed_by_user_id IN (SELECT id FROM seed_users)`],
  ['v1_team_memberships', `id::text LIKE '00000000-%' OR team_id IN (SELECT id FROM seed_teams) OR user_id IN (SELECT id FROM seed_users) OR removed_by_user_id IN (SELECT id FROM seed_users)`],
  ['v1_team_trust_scores', `team_id IN (SELECT id FROM seed_teams) OR source_label LIKE 'seed%'`],
  ['v1_team_profiles', `team_id IN (SELECT id FROM seed_teams)`],
  ['v1_teams', `id IN (SELECT id FROM seed_teams)`],
  ['v1_match_participants', `id::text LIKE '00000000-%' OR match_id IN (SELECT id FROM seed_matches) OR user_id IN (SELECT id FROM seed_users)`],
  ['v1_match_applications', `id::text LIKE '00000000-%' OR match_id IN (SELECT id FROM seed_matches) OR applicant_user_id IN (SELECT id FROM seed_users) OR reviewed_by_user_id IN (SELECT id FROM seed_users)`],
  ['v1_matches', `id IN (SELECT id FROM seed_matches)`],
  ['v1_search_histories', `id::text LIKE '00000000-%' OR user_id IN (SELECT id FROM seed_users)`],
  ['v1_admin_users', `id IN (SELECT id FROM seed_admin_users)`],
  ['v1_verification_tokens', `id::text LIKE '00000000-%' OR user_id IN (SELECT id FROM seed_users)`],
  ['v1_notification_preferences', `user_id IN (SELECT id FROM seed_users)`],
  ['v1_user_reputation_summaries', `user_id IN (SELECT id FROM seed_users) OR source_label LIKE 'seed%'`],
  ['v1_user_regions', `id::text LIKE '00000000-%' OR user_id IN (SELECT id FROM seed_users)`],
  ['v1_user_sport_preferences', `id::text LIKE '00000000-%' OR user_id IN (SELECT id FROM seed_users)`],
  ['v1_user_terms_consents', `id::text LIKE '00000000-%' OR user_id IN (SELECT id FROM seed_users)`],
  ['v1_user_onboarding_progress', `user_id IN (SELECT id FROM seed_users)`],
  ['v1_user_profiles', `user_id IN (SELECT id FROM seed_users)`],
  ['v1_auth_identities', `id::text LIKE '00000000-%' OR user_id IN (SELECT id FROM seed_users) OR provider_user_key LIKE '%@teameet.v1' OR email LIKE '%@teameet.v1'`],
  ['v1_users', `id IN (SELECT id FROM seed_users)`],
  ['v1_notices', `id::text LIKE '00000000-%' OR body LIKE '%seed data%'`],
] as const;

async function count(table: string, where: string) {
  const rows = await prisma.$queryRawUnsafe<{ count: number | bigint }[]>(`${cte} SELECT COUNT(*)::int AS count FROM ${table} WHERE ${where}`);
  return Number(rows[0]?.count ?? 0);
}

async function main() {
  const before: Array<[string, number]> = [];
  for (const [table, where] of targets) {
    before.push([table, await count(table, where)]);
  }

  console.table(before.map(([table, rows]) => ({ table, rows })));

  if (!execute) {
    console.log('Dry-run only. Re-run with --execute --confirm=delete-v1-demo-data after backup and review.');
    return;
  }
  if (!confirmed) {
    throw new Error('Missing --confirm=delete-v1-demo-data. Refusing to delete v1 demo data.');
  }

  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`${cte} UPDATE v1_chat_room_participants SET last_read_message_id = NULL WHERE last_read_message_id IN (SELECT id FROM v1_chat_messages WHERE id::text LIKE '00000000-%' OR chat_room_id IN (SELECT id FROM seed_chat_rooms) OR sender_user_id IN (SELECT id FROM seed_users))`);
    for (const [table, where] of targets) {
      await tx.$executeRawUnsafe(`${cte} DELETE FROM ${table} WHERE ${where}`);
    }
  });

  console.log('Deleted v1 demo data candidates. Run the script again without --execute to verify remaining counts.');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
