import { PrismaClient, V1TournamentStatus } from '@prisma/client';

import { leagueMirrorDetailData, mirrorDetailMatches } from '../league-competition-mirror';

/**
 * **리그 → 대회 표시 필드 백필 (R4-a).**
 *
 * 리그 시즌 백필(`league-competition-backfill.ts`)은 **식별에 필요한 것만** 옮겼다
 * (`id`·`title`·`kind`·`sportId`·`series`·`tier`·`seasonNo`). 화면이 쓰는 나머지는
 * 비어 있어서, 통합 축만 읽으면 리그 목록이 **에러 없이 잘못 그려진다**:
 *
 * ```
 * status        88행 전부 draft   → listMine 의 state 게이트가 무너져 active·completed 53개의
 *                                   순위·다음 경기가 통째로 사라진다 (에러 없이)
 * scheduledAt   88행 전부 NULL    → 기간이 안 보인다
 * regionId      컬럼이 없었다     → R4-a expand 로 추가했다
 * ```
 *
 * ## 앞선 두 백필과 성격이 다르다 — **INSERT 가 아니라 UPDATE 다**
 * 그래서 백스톱이 PK 유니크 위반일 수 없다. 대신 **가드 조건을 `where` 에 넣어**
 * 쓰기 시점에 강제한다(읽고 나서 쓰는 사이의 경합을 `where` 가 막는다).
 *
 * ## `status` 매핑 — **D7 과 무관하다**
 * | `V1LeagueState` | `V1TournamentStatus` | 왜 |
 * |---|---|---|
 * | `draft` | `draft` | 그대로 |
 * | `active` | `in_progress` | **오늘의 리그에는 신청 단계가 없다.** 운영자가 팀을 넣고 시즌이 돈다 — 그래서 `active` 는 "경기가 진행 중"이라는 뜻이다 |
 * | `completed` | `completed` | 그대로 |
 *
 * **`open` 은 쓰지 않는다.** `open` 은 "신청 받는 중"이고 그 단계는 **오늘 존재하지 않는다** —
 * D7(참가 경로를 신청제로 통일)이 도입할 때 생긴다. 즉 이 매핑은 D7 을 미리 정하는 것이
 * 아니라 **현재 의미를 그대로 옮기는 것**이다. `open` 이 비어 있는 것은 누락이 아니다.
 */

export interface LeagueDetailBackfillResult {
  scanned: number;
  /** 이미 목표값이라 건드릴 필요가 없던 행 — dual-write 가 만든 새 리그의 거울이 여기 온다. */
  skipped: number;
  /** `kind='regular_league'` 대회 행 수. **리그 수와 같아야 한다** — 불변식의 관측값이다. */
  mirrorCount: number;
  /**
   * **고칠 계획인 행 수.** dry-run 에서 `updated` 는 항상 0 이라(쓰지 않으니까) 이 값이
   * 없으면 **"몇 건이 바뀌는가" 를 알 수 없다** — 승인을 요청할 때 필요한 바로 그 숫자다.
   * `--apply` 후에는 `updated` 와 같아야 하고, 다르면 위 개수 단언이 이미 던졌다.
   */
  planned: number;
  updated: number;
  dryRun: boolean;
}

export class LeagueDetailBackfillBlockedError extends Error {
  constructor(
    message: string,
    readonly detail: {
      missingTournaments: Array<{ leagueId: string }>;
      kindMismatches: Array<{ leagueId: string; kind: string | null }>;
      /**
       * **목표와 다른 값**이 이미 있는 행. 단순히 채워져 있는 것은 여기 오지 않는다.
       *
       * 필드 이름만이 아니라 **현재 값과 쓰려던 값을 함께** 싣는다 — 이 에러가 `--apply` 가
       * 막혔을 때 운영자가 보는 **유일한 단서**이고, 이름만 있으면 결국 DB 를 직접 대조해야
       * 한다(2026-08-31 에 실제로 그랬다).
       */
      conflicts: Array<{
        leagueId: string;
        fields: Array<{ field: string; current: string | null; expected: string }>;
      }>;
    },
  ) {
    super(message);
    this.name = 'LeagueDetailBackfillBlockedError';
  }
}

export async function backfillLeagueCompetitionDetails(
  prisma: PrismaClient,
  options: { dryRun: boolean },
): Promise<LeagueDetailBackfillResult> {
  const leagues = await prisma.v1League.findMany({
    select: { id: true, state: true, startsOn: true, endsOn: true, regionId: true },
    orderBy: { id: 'asc' },
  });

  // ── 가드 1: 대회 행이 없는 것 / 종류가 리그가 아닌 것 ─────────────────────
  // **두 통으로 나눈다.** 종류로 걸러 읽거나 한 배열에 합치면 운영자가 조치를 못 고른다:
  //   행이 없다      → 리그 시즌 백필을 **먼저 돌려라**
  //   종류가 다르다  → 그 id 는 **우리 리그가 아니다.** 멈추고 조사해라
  // (참가팀 백필에서 같은 지적을 받아 고쳤는데 이 파일에 그대로 재현했다 — Copilot 이 잡았다.)
  const tournaments = await prisma.v1Tournament.findMany({
    where: { id: { in: leagues.map((row) => row.id) } },
    select: { id: true, kind: true, status: true, scheduledAt: true, scheduledEndAt: true, regionId: true },
  });
  const byId = new Map(tournaments.map((row) => [row.id, row]));
  const missingTournaments = leagues
    .filter((league) => !byId.has(league.id))
    .map((league) => ({ leagueId: league.id }));
  const kindMismatches = leagues
    .filter((league) => byId.has(league.id) && byId.get(league.id)?.kind !== 'regular_league')
    .map((league) => ({ leagueId: league.id, kind: byId.get(league.id)?.kind ?? null }));

  // ── 가드 2: **목표와 다른 값**이 이미 있는 행 ──────────────────────────────
  // **덮어쓰기를 하지 않는다.** 덮어쓰는 순간 원래 값이 사라져 되돌리기가 불가능해진다
  // (앞선 두 백필은 INSERT 라 되돌리기가 DELETE 였지만, UPDATE 는 그렇지 않다).
  //
  // ⚠️ **"채워져 있다" 가 아니라 "다르다" 로 판정한다.** 처음엔 "값이 있으면 막는다" 로
  // 썼는데, 2026-08-31 alpha dry-run 이 **QA 시드 리그 하나 때문에 통째로 막혔다**:
  // ```
  //         status      scheduled_at   scheduled_end_at   region_id
  // league  completed   A              B                  R
  // mirror  draft       A              B                  R      ← 날짜·지역은 이미 목표값이다
  // ```
  // QA 시드가 배포마다 dual-write 의 **update 분기**로 title·날짜·region 을 동기화하는데,
  // `status` 는 (스태프가 바꾼 값을 재배포가 되돌리지 않도록) **create 전용**이라 `draft` 로
  // 남는다. 그래서 **부분만 채워진 정상 행**이 생긴다.
  //
  // 가드의 목적은 *"모르는 값을 덮어쓰지 않는다"* 인데 **우리가 쓸 값과 같은 것은 모르는
  // 값이 아니다.** 그래서 목표와 **다른** 필드만 막는다. 전부 같으면 할 일이 없어 건너뛴다.
  const conflicts: Array<{
    leagueId: string;
    fields: Array<{ field: string; current: string | null; expected: string }>;
  }> = [];
  const skippable = new Set<string>();
  for (const league of leagues) {
    const row = byId.get(league.id);
    if (!row || row.kind !== 'regular_league') continue;
    const target = leagueMirrorDetailData(league);
    if (mirrorDetailMatches(row, target)) {
      skippable.add(league.id);
      continue;
    }
    // **`null` 은 "아직 안 채움" 이지 "다른 값" 이 아니다** — 그건 우리가 채울 자리다.
    // `status` 의 `draft` 도 같은 뜻이다(백필 전 기본값).
    const conflicting: Array<{ field: string; current: string | null; expected: string }> = [];
    if (row.status !== V1TournamentStatus.draft && row.status !== target.status) {
      conflicting.push({ field: 'status', current: row.status, expected: target.status });
    }
    if (row.scheduledAt !== null && row.scheduledAt.getTime() !== target.scheduledAt.getTime()) {
      conflicting.push({
        field: 'scheduledAt',
        current: row.scheduledAt.toISOString(),
        expected: target.scheduledAt.toISOString(),
      });
    }
    if (
      row.scheduledEndAt !== null &&
      row.scheduledEndAt.getTime() !== target.scheduledEndAt.getTime()
    ) {
      conflicting.push({
        field: 'scheduledEndAt',
        current: row.scheduledEndAt.toISOString(),
        expected: target.scheduledEndAt.toISOString(),
      });
    }
    if (row.regionId !== null && row.regionId !== target.regionId) {
      conflicting.push({ field: 'regionId', current: row.regionId, expected: target.regionId });
    }
    if (conflicting.length > 0) conflicts.push({ leagueId: league.id, fields: conflicting });
  }

  if (missingTournaments.length > 0 || kindMismatches.length > 0 || conflicts.length > 0) {
    // **메시지가 실제 의미를 말해야 한다.** "이미 값이 채워진 행" 이라고 하면 다음 사람은
    // *"그럼 채워진 게 정상인가? skip 하면 되나?"* 로 간다 — 틀린 결론이다. 실제 의미는
    // **"우리가 쓰려는 값과 다른 값이 있다"** 이고, 그건 *"누가 왜 다른 값을 넣었나"* 라는
    // 다른 질문으로 이어진다. 이 문장이 `--apply` 가 막혔을 때 보이는 유일한 단서다.
    throw new LeagueDetailBackfillBlockedError(
      '백필을 중단했다 — 대회 행이 없는 리그, 종류가 리그가 아닌 대회 행, ' +
        '또는 **목표와 다른 값**이 이미 있는 행이 있다(단순히 채워져 있는 것은 막지 않는다).',
      { missingTournaments, kindMismatches, conflicts },
    );
  }

  const toUpdate = leagues.filter((league) => !skippable.has(league.id));
  let updated = 0;
  let mirrorCount = 0;

  if (!options.dryRun && toUpdate.length > 0) {
    // ── **interactive 트랜잭션이어야 한다 — 배열형이면 단언이 롤백을 못 일으킨다** ────
    // `$transaction([...])` 는 결과를 돌려주기 **전에 커밋한다.** 그래서 그 뒤에서 개수를
    // 세고 throw 하면 **이미 커밋된 부분 적용이 남고 종료 코드만 실패**가 된다
    // (88 중 87 만 매칭되면 87 은 들어간 채 "실패" 로 끝난다).
    //
    // 이건 **사용자 승인을 받아 alpha 에 돌리는 쓰기**다. 승인을 받는 작업에 필요한 성질은
    // 전부 되거나 전부 안 되거나이고, "실패했다는데 87 행은 들어갔다" 는 승인자가 판단할 수
    // 없는 상태다. interactive 형에서는 아래 두 단언이 모두 롤백을 일으킨다.
    //
    // > **앞선 참가팀 백필(create)은 같은 모양이어도 이 결함이 아니다** — `create` 는
    // > 실패하면 트랜잭션 전체가 터져 결과가 아예 안 돌아온다. `updateMany` 만 **에러 없이
    // > 0행**을 돌려줄 수 있어서 "커밋됐는데 개수가 안 맞는" 상태가 성립한다.
    //
    // 88행이라 순차 왕복 비용은 무시해도 된다.
    await prisma.$transaction(async (tx) => {
      for (const league of toUpdate) {
        // 가드 조건을 `where` 에 넣는다. 위 가드는 트랜잭션 **밖** 스냅샷이라 읽기와 쓰기
        // 사이의 경합을 못 잡지만, 이 `where` 는 **쓰기 시점에** 강제된다 — 그 사이 누가
        // 값을 채웠으면 이 행은 count 0 이 되고 아래 합계 단언이 걸린다.
        // **`where` 는 "비어 있는가" 가 아니라 "내가 읽은 그대로인가" 를 묻는다.**
        // `null` 을 요구하면 위 가드가 통과시킨 **부분 채움 행**(시드가 날짜·지역만 동기화한
        // 것)이 0행 매칭이 되어 개수 단언에 걸린다. 관측값을 그대로 걸면 **경합 보호는
        // 유지되면서**(읽기~쓰기 사이 누가 바꾸면 0행) 부분 채움도 통과한다.
        // **`observed?.` 를 쓰지 않는다.** Prisma 의 `where` 는 값이 `undefined` 면 그 조건을
        // **통째로 버린다** — optional chaining 이면 `observed` 가 없을 때 `status` 조건이
        // 조용히 사라지고, 가드가 있는데 아무것도 안 거는 상태가 된다.
        //
        // 가드 1 이 모든 리그에 거울이 있음을 이미 확인했으므로 여기서 없을 수는 없다.
        // 그래도 **`!` 로 넘기지 않는다** — 없다면 위 가드가 무력해진 것이고 드러나야 한다.
        const observed = byId.get(league.id);
        if (observed === undefined) {
          throw new Error(
            `거울을 읽지 못했다: ${league.id}. 가드 1 을 통과했는데 여기서 없다면 그 가드가 무력해진 것이다.`,
          );
        }
        const result = await tx.v1Tournament.updateMany({
          where: {
            id: league.id,
            kind: 'regular_league',
            status: observed.status,
            scheduledAt: observed.scheduledAt,
            scheduledEndAt: observed.scheduledEndAt,
            regionId: observed.regionId,
          },
          data: leagueMirrorDetailData(league),
        });
        updated += result.count;
      }
      if (updated !== toUpdate.length) {
        throw new Error(
          `백필이 고친 행 수가 계획과 다르다: 계획 ${toUpdate.length} · 실제 ${updated}`,
        );
      }

      // ── 불변식: 리그 수 == 거울 수 ──────────────────────────────────────────
      // **이 단언도 트랜잭션 안이어야 한다** — 밖에 두면 위와 같은 문제가 된다(쓰기는
      // 커밋되고 종료 코드만 실패). dual-write 의 `updateMany` 는 0행이어도 조용하고,
      // "백필 후에는 0이면 안 된다" 를 주석으로만 두면 아무도 확인하지 않는다.
      // 모자라면 dual-write 가 빠진 쓰기 자리가 있다는 뜻이고, 그 리그는 read-swap 뒤
      // 화면에서 조용히 사라진다.
      mirrorCount = await tx.v1Tournament.count({ where: { kind: 'regular_league' } });
      if (mirrorCount !== leagues.length) {
        throw new Error(
          `거울 수가 리그 수와 다르다: 리그 ${leagues.length} · 거울 ${mirrorCount}. ` +
            'dual-write 가 빠진 쓰기 자리가 있는지 확인해라(scripts/league-write-site-baseline.json).',
        );
      }
    });
  } else {
    // 트랜잭션을 열지 않는 경우다. **여기 오는 길이 둘이라는 걸 놓치기 쉽다:**
    //   ① dry-run
    //   ② `--apply` 인데 고칠 게 없다(`toUpdate` 가 비었다)
    // ②는 **`--apply` 를 한 번 돌린 뒤 확인차 다시 돌릴 때** 오는 길이다.
    mirrorCount = await prisma.v1Tournament.count({ where: { kind: 'regular_league' } });
  }

  // ── 불변식은 **쓰기 여부와 무관하게** `--apply` 면 항상 센다 ──────────────────
  // 처음엔 이 검사를 위 트랜잭션 **안에만** 뒀는데, 그러면 `--apply` + `toUpdate` 가 빈
  // 경우에 **통째로 건너뛰고 통과**한다. 그런데 그 경우가 바로 **"다 들어갔나" 를 확인하려고
  // 재실행하는 순간**이다 — 검사가 가장 필요한 때에 사라지고, 운영자는 출력만 보고
  // "불변식 통과" 로 읽는다.
  //
  // 쓰기가 있었으면 위 트랜잭션 안에서 이미 걸렸다(그래야 롤백된다). 여기 검사는 **쓰기가
  // 없었던 경로**를 덮는다 — 던질 뿐 되돌릴 것이 없으므로 트랜잭션 밖이어도 된다.
  if (!options.dryRun && mirrorCount !== leagues.length) {
    throw new Error(
      `거울 수가 리그 수와 다르다: 리그 ${leagues.length} · 거울 ${mirrorCount}. ` +
        'dual-write 가 빠진 쓰기 자리가 있는지 확인해라(scripts/league-write-site-baseline.json).',
    );
  }

  // **계획이 아니라 실적을 반환한다.** 위 단언이 통과했으면 둘이 같지만, 계획값을 실적으로
  // 보고하는 모양 자체가 "쓴 것과 보고한 것이 다를 수 있는" 구조다.
  return {
    scanned: leagues.length,
    skipped: skippable.size,
    planned: toUpdate.length,
    updated,
    mirrorCount,
    dryRun: options.dryRun,
  };
}
