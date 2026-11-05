import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';

/**
 * 2026-10-27 리그 신청 상태 마이그레이션의 기존 데이터 이전을 실제 PostgreSQL 에서 확인한다.
 *
 * `registration_deadline_at` 은 UTC 값을 담은 `timestamp`(시간대 없음)다. 마이그레이션 세션의 TimeZone 이 UTC 가
 * 아니면 `now()`(timestamptz)와의 비교가 그 오프셋만큼 어긋난다(PR #2065 리뷰). 그래서 마감을 지금 ±3시간에
 * 두고 UTC 보다 빠른(서울 +9) 세션과 느린(로스앤젤레스 −7/−8) 세션 양쪽에서 돌린다 — 어느 쪽이든 오프셋 안의
 * 경계값이 뒤집히면 실패한다.
 *
 * 통합 실행기가 격리된 복제 DB 를 강제한다. 임시 테이블이 같은 연결에서 `v1_tournaments` 를 가리고 커밋 때 사라진다.
 */
describe('league registration status migration (non-UTC sessions)', () => {
  const prisma = new PrismaClient();
  afterAll(async () => prisma.$disconnect());

  // 파일의 UPDATE 네 개를 그대로 쓴다 — prepared statement 는 한 번에 한 문장만 받아서 주석을 걷고 나눠 실행한다.
  const statements = readFileSync(
    join(__dirname, '../../prisma/migrations/20261027120000_league_registration_status/migration.sql'),
    'utf8',
  )
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
    .split(';')
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);

  it.each(['Asia/Seoul', 'America/Los_Angeles'])('%s 세션에서도 UTC 마감 기준으로 옮긴다', async (timeZone) => {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL TIME ZONE '${timeZone}'`);
      await tx.$executeRawUnsafe('CREATE TEMP TABLE v1_tournaments (LIKE public.v1_tournaments INCLUDING ALL) ON COMMIT DROP');
      // 마감은 세션 시간대와 무관하게 "지금(UTC) ± 3시간" 의 UTC 벽시계 값으로 넣는다 — 앱이 저장하는 모양과 같다.
      await tx.$executeRawUnsafe(`INSERT INTO pg_temp.v1_tournaments
        (id, sport_id, title, kind, status, held_from_status, registration_deadline_at, deleted_at, updated_at)
        SELECT r.id, 'migration-sport', r.id, r.kind::"V1CompetitionKind", r.status::"V1TournamentStatus",
          r.held::"V1TournamentStatus",
          CASE WHEN r.hours IS NULL THEN NULL ELSE (now() AT TIME ZONE 'UTC') + make_interval(hours => r.hours) END,
          CASE WHEN r.deleted THEN TIMESTAMP '2026-01-01 00:00:00' ELSE NULL END,
          TIMESTAMP '2026-01-01 00:00:00'
        FROM (VALUES
          ('draft-soon', 'regular_league', 'draft', NULL, 3, false),
          ('closed-soon', 'regular_league', 'closed', NULL, 3, false),
          ('draft-past', 'regular_league', 'draft', NULL, -3, false),
          ('open-null', 'regular_league', 'open', NULL, NULL, false),
          ('open-past', 'regular_league', 'open', NULL, -3, false),
          ('progress-soon', 'regular_league', 'in_progress', NULL, 3, false),
          ('held-draft-soon', 'regular_league', 'on_hold', 'draft', 3, false),
          ('held-draft-past', 'regular_league', 'on_hold', 'draft', -3, false),
          ('held-open-null', 'regular_league', 'on_hold', 'open', NULL, false),
          ('deleted-soon', 'regular_league', 'draft', NULL, 3, true),
          ('tournament-soon', 'regular_tournament', 'draft', NULL, 3, false)
        ) AS r(id, kind, status, held, hours, deleted)`);

      expect(statements).toHaveLength(4);
      for (const statement of statements) await tx.$executeRawUnsafe(statement);

      const rows = await tx.$queryRawUnsafe<Array<{ id: string; status: string; held: string | null; moved_recently: boolean }>>(
        `SELECT id, status::text AS status, held_from_status::text AS held,
          abs(extract(epoch FROM updated_at - (now() AT TIME ZONE 'UTC'))) < 60 AS moved_recently
        FROM pg_temp.v1_tournaments ORDER BY id`,
      );
      const byId = Object.fromEntries(rows.map((row) => [row.id, row]));

      // 시작 전이면서 마감이 남은 리그만 접수 중으로 — 마감 3시간 전·후 경계가 시간대에 따라 뒤집히지 않는다.
      expect(byId['draft-soon']).toMatchObject({ status: 'open', moved_recently: true });
      expect(byId['closed-soon']).toMatchObject({ status: 'open', moved_recently: true });
      expect(byId['draft-past']).toMatchObject({ status: 'draft', moved_recently: false });
      // 마감 없는 옛 접수 중은 마감으로, 마감이 지난 접수 중은 그대로(새 규칙이 마감으로 막는다).
      expect(byId['open-null']).toMatchObject({ status: 'closed', moved_recently: true });
      expect(byId['open-past']).toMatchObject({ status: 'open', moved_recently: false });
      // 진행 중·삭제·대회 행은 건드리지 않는다.
      expect(byId['progress-soon']).toMatchObject({ status: 'in_progress', moved_recently: false });
      expect(byId['deleted-soon']).toMatchObject({ status: 'draft', moved_recently: false });
      expect(byId['tournament-soon']).toMatchObject({ status: 'draft', moved_recently: false });
      // 보류는 상태를 그대로 두고 돌아갈 상태만 같은 규칙으로 옮긴다.
      expect(byId['held-draft-soon']).toMatchObject({ status: 'on_hold', held: 'open', moved_recently: true });
      expect(byId['held-draft-past']).toMatchObject({ status: 'on_hold', held: 'draft', moved_recently: false });
      expect(byId['held-open-null']).toMatchObject({ status: 'on_hold', held: 'closed', moved_recently: true });
    }, { timeout: 15_000 });
  });
});
