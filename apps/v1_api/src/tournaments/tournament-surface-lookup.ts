import { NotFoundException } from '@nestjs/common';
import { Prisma, V1CompetitionKind } from '@prisma/client';

/**
 * **대회 단건 조회의 단 하나의 입구.**
 *
 * `TOURNAMENT_SURFACE_KIND`(목록·집계용 상수)와 짝이 되는 **단건 조회용** 도구다.
 * 목록은 상수 하나를 `where` 에 펴 넣으면 끝나지만, 단건 조회는 그렇지 않았다 —
 * 조건을 **안 거는 것이 기본값**이고, 거는 것이 호출부의 선택이었다. 그래서 49곳 중
 * 대부분이 조건 없이 남았다.
 *
 * ## 이게 왜 필요했나 — "가드 뒤라 안전"이 틀렸다
 * #856 은 목록·집계 6곳에만 조건을 걸고 `findUnique({ where: { id } })` 계열은
 * **"어드민 가드 뒤라 안전"** 으로 넘겼다. 그 분류가 틀렸다:
 *
 * > **가드는 *누가* 부르는지를 막지, *무엇을* 부르는지를 막지 않는다.**
 *
 * 백필(R3)이 정규 리그 시즌을 `v1_tournaments` 에 만들자 예전엔 존재하지 않던 id 가
 * 이 조회들을 통과하기 시작했고, alpha 에서 **비인증 공개 경로**
 * `/tournaments/<리그id>/schedule` 이 **리그 제목을 실은 200** 을 줬다(실측, #863).
 *
 * ## `allowedKinds` 에 기본값을 주지 않는 이유
 * 기본값이 있으면 호출부가 **생각하지 않고 지나간다.** 리그를 의도적으로 허용해야 하는
 * 곳이 실제로 있으므로(백필 자신, 나중에 read-swap 이 쓸 경로), 그런 곳은
 * `[...TOURNAMENT_KINDS]` 를 **명시**하게 만든다 — 그 명시 자체가 리뷰 포인트가 된다.
 *
 * ## `kind: null` 은 `regular_tournament` 쪽에 붙는다
 * `kind` 는 nullable 이다(NOT NULL 승격은 R5). `regular_tournament` 를 허용하면
 * `kind: null`(R1 이전 행)도 **함께 통과해야 한다** — 안 그러면 옛 대회가 사용자 화면에서
 * 통째로 사라진다. 반대로 `regular_league` 만 허용한 곳에서 `kind: null` 이 통과하면
 * **옛 대회가 리그 규칙에 걸리는 새 회귀**가 되므로, null 은 오직 tournament 쪽에만 붙인다.
 */
export const TOURNAMENT_KINDS = [V1CompetitionKind.regular_tournament] as const;
export const LEAGUE_KINDS = [V1CompetitionKind.regular_league] as const;
export const ALL_COMPETITION_KINDS = [
  V1CompetitionKind.regular_tournament,
  V1CompetitionKind.regular_league,
] as const;

/**
 * `PrismaService` 와 `$transaction` 콜백이 주는 클라이언트를 **둘 다** 받는다.
 *
 * 트랜잭션 안에서 못 쓰면 그 지점만 조건 없이 남는데(등록 제출의 TOCTOU 재검증이
 * 정확히 그 모양이다), **남았다는 사실이 드러나지 않는다** — 트랜잭션 밖 조회는
 * 막혀 있으니 겉보기엔 닫힌 것처럼 보인다.
 */
export type TournamentSurfaceClient = {
  v1Tournament: {
    // 반환이 `unknown` 인 것은 **구조적 최소 계약**이기 때문이다 — 실제 Prisma 클라이언트와
    // 트랜잭션 클라이언트가 둘 다 여기에 맞아야 하고, 행 타입은 호출부의 `select`/`include`
    // 에 따라 달라져 여기서 고정할 수 없다. 실제 행 타입은 아래 함수가
    // `Prisma.V1TournamentGetPayload<Args>` 로 복원한다.
    //
    // `unknown` 은 **이미 `null` 을 포함한다**(`Promise<unknown>` 계약에 `null` 반환이
    // 그대로 대입된다 — tsc --strict 로 확인). `unknown | null` 로 적어도 같은 타입이라
    // 바뀌는 게 없다. 미매칭이 `null` 이라는 사실은 아래 함수의 반환 타입
    // (`… | null`)과 `OrThrow` 변형이 표현한다(Copilot 리뷰가 이 자리를 지적했으나
    // 전제가 성립하지 않아 그대로 둔다).
    findFirst: (args: Prisma.V1TournamentFindFirstArgs) => Prisma.PrismaPromise<unknown>;
  };
};

/** 허용 종류를 `where` 조건으로 바꾼다. 위 주석대로 null 은 tournament 쪽에만 붙는다. */
export function tournamentKindCondition(
  allowedKinds: readonly V1CompetitionKind[],
): Prisma.V1TournamentWhereInput {
  if (allowedKinds.length === 0) {
    // 빈 배열을 "전부 허용"으로 읽으면 게이트가 조용히 열린다 — fail-closed 로 던진다.
    throw new Error('allowedKinds 가 비어 있다 — 허용할 종류를 명시해라.');
  }
  const or: Prisma.V1TournamentWhereInput[] = allowedKinds.map((kind) => ({ kind }));
  if (allowedKinds.includes(V1CompetitionKind.regular_tournament)) {
    or.push({ kind: null });
  }
  return { OR: or };
}

/**
 * 대회 단건 조회. `args.where` 는 **덮어쓰지 않고 `AND` 로 감싼다** — 호출부가 이미
 * `OR` 을 쓰고 있으면 펴 넣기(`...`)가 그 `OR` 을 통째로 날려서, 조건이 사라진 채
 * 조용히 통과한다.
 */
export async function findTournamentOnSurface<Args extends Prisma.V1TournamentFindFirstArgs>(
  db: TournamentSurfaceClient,
  allowedKinds: readonly V1CompetitionKind[],
  args: Args,
): Promise<Prisma.V1TournamentGetPayload<Args> | null> {
  const { where, ...rest } = args;
  const result = await db.v1Tournament.findFirst({
    ...rest,
    where: { AND: [tournamentKindCondition(allowedKinds), where ?? {}] },
  });
  return result as Prisma.V1TournamentGetPayload<Args> | null;
}

/**
 * 위와 같되 없으면 **404 `TOURNAMENT_NOT_FOUND`**.
 *
 * 코드를 따로 만들지 않는다 — "리그 id 라서 막혔다"는 사실 자체가 정보이고, 대회가
 * 없는 것과 구분해 줄 이유가 없다.
 */
export async function findTournamentOnSurfaceOrThrow<
  Args extends Prisma.V1TournamentFindFirstArgs,
>(
  db: TournamentSurfaceClient,
  allowedKinds: readonly V1CompetitionKind[],
  args: Args,
): Promise<Prisma.V1TournamentGetPayload<Args>> {
  const row = await findTournamentOnSurface(db, allowedKinds, args);
  if (row === null) {
    throw new NotFoundException({ code: 'TOURNAMENT_NOT_FOUND', message: '대회를 찾을 수 없어요.' });
  }
  return row;
}
