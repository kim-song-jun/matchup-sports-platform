import { Prisma, PrismaClient } from '@prisma/client';
// 설정 버전 id 는 설정 백필 모듈이 소유한다 — 여기서 값을 복제하지 않고 그대로 빌려 쓴다
// (두 벌이 되면 나중에 한쪽만 바뀐다).
import {
  FOOTBALL_COMPETITION_CONFIG_ID,
  FUTSAL_COMPETITION_CONFIG_ID,
} from '../competition-config/competition-config-backfill';

/**
 * **정규 리그 시즌을 통합 축(`V1Tournament`)으로 백필한다 — R3.**
 *
 * 마이그레이션이 아니라 CLI 인 이유: 이건 순수 DML 이고 **expand-contract 게이트 아래에서
 * DML 은 additive 가 아니다**(`competition-config-backfill.ts` 가 같은 이유로 migration.sql
 * 밖으로 나왔다). CI 도 `prisma migrate deploy` 뒤에 CLI 를 따로 부른다.
 *
 * ## 새 행이 기존 리그와 **같은 id** 를 쓴다
 * `V1League` 행 하나가 곧 시즌 하나다(`seriesId`·`tier`·`seasonNo` 를 직접 들고 있다) —
 * 리그↔대회가 진짜 1:1 이라 id 동일이 성립한다. 별도 대응 컬럼을 파지 않는 이유:
 * 대응표는 R5 에서 지워야 할 임시물이고, 컬럼을 만들면 **나중에 지울 것을 하나 늘린다.**
 * provenance 는 `kind='regular_league'` + 같은 id 가 곧 출처다. 그리고 read-swap 때
 * `/leagues/<id>` 와 `/tournaments/<id>` 가 같은 것을 가리켜 **기존 링크·알림 딥링크가 산다.**
 *
 * ## `status` 는 전부 `draft` 다 — 매핑하지 않는다
 * `V1LeagueState(draft|active|completed)` → `V1TournamentStatus(draft|open|closed|
 * in_progress|completed|cancelled)` 매핑은 **read-swap 에서 정한다.** 미루는 이유는 어려워서가
 * 아니라 **`active` 의 정답이 D7(신청제) 결정에 달려 있기** 때문이다 — `active` 리그가
 * 경기 중(`in_progress`)인지 아직 신청을 받는 중(`open`)인지는 사용자가 아직 안 골랐다.
 * 지금 매핑하면 코드가 그 결정을 먼저 해 버리고, 나중에 고치는 DML 이 또 필요해진다.
 *
 * 부수 이득이 크다: 공개 목록·상세·순위가 이미 `status` 로 거르는데 `draft` 는 그 목록에
 * 없다(`PUBLIC_TOURNAMENT_STATUS_FILTER = open|closed|in_progress|completed`). 즉 백필 행은
 * `TOURNAMENT_SURFACE_KIND` **와 독립적으로도** 공개 표면에 안 걸린다 — **게이트가 두 겹**이다.
 * 백필이 이 작업에서 제일 되돌리기 어려운 단계라 그 자체로 값이 있다.
 */

/** 설정 축이 지원하는 종목. 이 밖의 리그는 **행을 만들지 않고 멈춘다**(아래 참고). */
const SUPPORTED_SPORT_CODES = new Set(['soccer', 'football', 'futsal']);

export interface LeagueBackfillResult {
  readonly scanned: number;
  readonly created: number;
  readonly skippedExisting: number;
  readonly dryRun: boolean;
  readonly unsupportedSports: ReadonlyArray<{ leagueId: string; sportCode: string | null }>;
  readonly idConflicts: ReadonlyArray<{ leagueId: string; existingKind: string | null }>;
}

export class LeagueBackfillBlockedError extends Error {
  constructor(
    message: string,
    readonly detail: Pick<LeagueBackfillResult, 'unsupportedSports' | 'idConflicts'>,
  ) {
    super(message);
    this.name = 'LeagueBackfillBlockedError';
  }
}

function configVersionIdForSport(sportCode: string): string {
  return sportCode === 'futsal' ? FUTSAL_COMPETITION_CONFIG_ID : FOOTBALL_COMPETITION_CONFIG_ID;
}

export async function backfillLeaguesAsCompetitions(
  prisma: PrismaClient,
  options: { dryRun: boolean },
): Promise<LeagueBackfillResult> {
  const leagues = await prisma.v1League.findMany({
    select: {
      id: true,
      title: true,
      sportId: true,
      seriesId: true,
      tier: true,
      seasonNo: true,
      sport: { select: { code: true } },
    },
    orderBy: { id: 'asc' },
  });

  // ── 가드 1: 미지원 종목 ────────────────────────────────────────────────────
  // 러닝·수영 리그를 대회 행으로 만들면 `assertAllSourcesHaveSupportedSport` 가
  // **`v1_tournaments` 전 행을 스캔하다** 걸려 설정 백필 도구 전체가 죽는다. 그 함수는
  // 인자로 행을 받지 않으므로 "그 리그만 빼면 되는" 문제가 아니다 — 한 행만 어긋나도
  // 던진다. 지금 alpha 리그 50개는 전부 futsal 이지만 그건 실측이지 불변식이 아니다.
  const unsupportedSports = leagues
    .filter((league) => !SUPPORTED_SPORT_CODES.has((league.sport?.code ?? '').toLowerCase()))
    .map((league) => ({ leagueId: league.id, sportCode: league.sport?.code ?? null }));

  // ── 가드 2: id 충돌 ───────────────────────────────────────────────────────
  // **"id 가 이미 있다"를 무조건 skip 으로 처리하지 않는다.** 우리가 만든
  // `kind='regular_league'` 행이면 재실행이므로 skip 이 맞지만, 다른 종류의 행이면
  // **남의 행을 우리 것으로 착각하는 것**이다 — 그때는 멈추고 보고한다.
  const existing = await prisma.v1Tournament.findMany({
    where: { id: { in: leagues.map((league) => league.id) } },
    select: { id: true, kind: true },
  });
  const existingById = new Map(existing.map((row) => [row.id, row.kind]));
  const idConflicts = existing
    .filter((row) => row.kind !== 'regular_league')
    .map((row) => ({ leagueId: row.id, existingKind: row.kind ?? null }));

  if (unsupportedSports.length > 0 || idConflicts.length > 0) {
    throw new LeagueBackfillBlockedError(
      '백필을 중단했다 — 미지원 종목 리그 또는 우리 것이 아닌 id 충돌이 있다.',
      { unsupportedSports, idConflicts },
    );
  }

  const toCreate = leagues.filter((league) => !existingById.has(league.id));

  // ── PK 가 진짜 백스톱이다 — 죽이지 마라 ───────────────────────────────────
  // 위 두 가드는 트랜잭션 **밖에서** 읽은 스냅샷이라, 가드와 쓰기 사이에 누가 같은 id 의
  // 행을 만들면 못 잡는다. 그때 실제로 막는 것은 **명시 `id` insert 의 PK 유니크 위반**이고,
  // 그게 터지면 트랜잭션 전체가 롤백된다. 즉 가드는 안전장치가 아니라 **좋은 에러 메시지**
  // 를 위한 것이다.
  //
  // 그래서 아래 세 가지를 하지 않는다:
  //   · `createMany({ skipDuplicates: true })` — 충돌이 조용히 무시돼 **백스톱이 사라진다**.
  //     "만들었다고 보고했는데 실제로는 안 만들어진" 상태가 되고, 그게 이 함수에서 가장
  //     그럴듯한 회귀 경로다("멱등하게 만들자"며 켜기 쉽다).
  //   · `upsert` — 같은 이유로 **남의 행을 덮어쓴다.**
  //   · 생성 결과를 세지 않고 넘어가기 — 아래에서 `toCreate.length` 와 대조한다.
  if (!options.dryRun && toCreate.length > 0) {
    const created = await prisma.$transaction(
      toCreate.map((league) =>
        prisma.v1Tournament.create({
          data: {
            id: league.id,
            sportId: league.sportId,
            title: league.title,
            kind: 'regular_league',
            // 위 주석 참고 — 매핑은 read-swap 에서 정한다.
            status: 'draft',
            seriesId: league.seriesId,
            tier: league.tier,
            seasonNo: league.seasonNo,
            competitionConfigVersionId: configVersionIdForSport((league.sport?.code ?? '').toLowerCase()),
          } satisfies Prisma.V1TournamentUncheckedCreateInput,
        }),
      ),
    );
    // 조용히 빠진 행이 없는지 확인한다 — 개수가 다르면 위 세 금지사항 중 하나가
    // 되살아났거나 경합이 있었다는 뜻이다.
    if (created.length !== toCreate.length) {
      throw new Error(
        `백필이 만든 행 수가 계획과 다르다: 계획 ${toCreate.length} · 실제 ${created.length}`,
      );
    }
  }

  return {
    scanned: leagues.length,
    created: options.dryRun ? 0 : toCreate.length,
    skippedExisting: leagues.length - toCreate.length,
    dryRun: options.dryRun,
    unsupportedSports,
    idConflicts,
  };
}
