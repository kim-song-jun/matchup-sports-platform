import type { V1AuthUser } from '../auth/v1-auth-user';
import type { PrismaService } from '../prisma/prisma.service';
import { LeagueClaimableFixturesService } from './league-claimable-fixtures.service';

/**
 * `listClaimableFixtures` (F8, 2026-08-26) 의 계약을 고정한다.
 *
 * ## 왜 `v1TeamMatch.findMany` 만 가짜 DB 로 돌리나
 * "내 팀이 참가하지 않은 리그의 대진은 안 보인다"는 **인가 경계**인데, 그 판정은 SQL
 * where 절에서 일어나 순수 stub 으로는 검증할 수 없다(무엇을 주든 그대로 돌려주므로
 * 필터를 통째로 지워도 테스트가 통과한다). 그래서 이 스펙은 where 를 실제로 해석하는
 * 최소 가짜를 두고 **반환 목록**을 단언한다 — 필터를 지우면 남의 대진이 결과에 섞여
 * 나오며 즉시 red 가 된다.
 *
 * 나머지(이미 연결된 참가자 제외·내 연결 대진 제외·건수 집계)는 서비스의 JS 로직이라
 * 평범한 stub 으로 충분하다.
 */
type FixtureSeed = {
  id: string;
  leagueId: string | null;
  hostTeamId: string;
  approvedApplicantTeamId: string | null;
  status: string;
  deletedAt: Date | null;
  title: string;
  startAt: Date;
  gameId: string | null;
  /**
   * 그 대진 게임의 공식 결과 리비전 id. null 이면 **아직 결과가 확정되지 않은 대진**이다 —
   * 시즌 전체 대진이 한 번에 생성되므로 여기엔 아직 열리지도 않은 미래 경기와 방금 끝나
   * 결과 입력을 기다리는 경기가 모두 들어온다.
   */
  officialRevisionId: string | null;
};

type FixtureWhere = {
  leagueId?: string;
  deletedAt?: null;
  status?: { not?: string };
  game?: { is?: { currentOfficialRevisionId?: { not: null } } };
  OR?: { hostTeamId?: { in: string[] }; approvedApplicantTeamId?: { in: string[] } }[];
};

/**
 * where 절 해석기 — 서비스가 실제로 쓰는 절만 이해한다. 조건을 하나라도 빼먹은 쿼리는
 * 여기서 "필터 없음"으로 취급돼 걸러져야 할 행이 통과한다(= 테스트 red).
 */
function matchesFixtureWhere(row: FixtureSeed, where: FixtureWhere): boolean {
  if (where.leagueId !== undefined && row.leagueId !== where.leagueId) return false;
  if ('deletedAt' in where && where.deletedAt === null && row.deletedAt !== null) return false;
  if (where.status?.not !== undefined && row.status === where.status.not) return false;
  const gameFilter = where.game?.is;
  if (gameFilter !== undefined) {
    // `is` 는 관계가 없는 행을 통과시키지 않는다. 게임이 없으면 결과도 없다.
    if (row.gameId === null) return false;
    if (gameFilter.currentOfficialRevisionId !== undefined && row.officialRevisionId === null) {
      return false;
    }
  }
  if (where.OR !== undefined) {
    const allowed = where.OR.some((clause) => {
      if (clause.hostTeamId !== undefined) return clause.hostTeamId.in.includes(row.hostTeamId);
      if (clause.approvedApplicantTeamId !== undefined) {
        return (
          row.approvedApplicantTeamId !== null &&
          clause.approvedApplicantTeamId.in.includes(row.approvedApplicantTeamId)
        );
      }
      return false;
    });
    if (!allowed) return false;
  }
  return true;
}

const user = { id: 'me', accountStatus: 'active' } as V1AuthUser;

function makeService(seed: {
  myTeamIds?: string[];
  fixtures?: FixtureSeed[];
  participants?: { id: string; gameId: string }[];
  links?: { participantId: string; userId: string }[];
}) {
  const fixtures = seed.fixtures ?? [];
  const prisma = {
    v1TeamMembership: {
      findMany: jest
        .fn()
        .mockResolvedValue((seed.myTeamIds ?? []).map((teamId) => ({ teamId }))),
    },
    v1TeamMatch: {
      findMany: jest.fn(async ({ where }: { where: FixtureWhere }) =>
        fixtures
          .filter((row) => matchesFixtureWhere(row, where))
          .map((row) => ({
            id: row.id,
            title: row.title,
            startAt: row.startAt,
            game: row.gameId === null ? null : { id: row.gameId },
          })),
      ),
    },
    v1GameParticipant: {
      findMany: jest.fn().mockResolvedValue(seed.participants ?? []),
    },
    v1ParticipantIdentityLinkCurrent: {
      findMany: jest.fn().mockResolvedValue(seed.links ?? []),
    },
  };
  const service = new LeagueClaimableFixturesService(prisma as unknown as PrismaService);
  return { service, prisma };
}

/**
 * 기본값은 **이미 치러지고 결과까지 확정된 지난 대진**이다(과거 startAt + 공식 리비전).
 * 리그는 시즌 전체 대진을 한 번에 만들기 때문에 "아직 안 치른 대진"이 기본형이 되면
 * 이 스펙 전체가 배너가 안내해선 안 되는 상태를 green 으로 못박게 된다.
 */
function fixture(overrides: Partial<FixtureSeed> & { id: string; gameId: string | null }): FixtureSeed {
  return {
    leagueId: 'league-1',
    hostTeamId: 'team-mine',
    approvedApplicantTeamId: 'team-rival',
    status: 'matched',
    deletedAt: null,
    title: `가을 리그 ${overrides.id}`,
    startAt: new Date('2026-08-01T10:00:00.000Z'),
    officialRevisionId: 'rev-official',
    ...overrides,
  };
}

describe('LeagueClaimableFixturesService.listClaimableFixtures', () => {
  it('내 팀이 참가하지 않은 대진은 목록에 나오지 않는다', async () => {
    const { service } = makeService({
      myTeamIds: ['team-mine'],
      fixtures: [
        fixture({ id: 'tm-mine', gameId: 'game-mine' }),
        // 두 팀 모두 남의 팀 — 이 리그를 구경만 하는 사람에게 열릴 이유가 없다.
        fixture({
          id: 'tm-others',
          gameId: 'game-others',
          hostTeamId: 'team-x',
          approvedApplicantTeamId: 'team-y',
        }),
      ],
      participants: [
        { id: 'p-mine', gameId: 'game-mine' },
        { id: 'p-others', gameId: 'game-others' },
      ],
    });

    const result = await service.listClaimableFixtures(user, 'league-1');

    expect(result.fixtures.map((row) => row.teamMatchId)).toEqual(['tm-mine']);
  });

  it('상대팀으로 참가한 대진도 내 대진으로 잡는다', async () => {
    const { service } = makeService({
      myTeamIds: ['team-mine'],
      fixtures: [
        fixture({
          id: 'tm-away',
          gameId: 'game-away',
          hostTeamId: 'team-x',
          approvedApplicantTeamId: 'team-mine',
        }),
      ],
      participants: [{ id: 'p-1', gameId: 'game-away' }],
    });

    const result = await service.listClaimableFixtures(user, 'league-1');

    expect(result.fixtures.map((row) => row.teamMatchId)).toEqual(['tm-away']);
  });

  it('다른 리그·취소된 대진·삭제된 대진은 제외한다', async () => {
    const { service } = makeService({
      myTeamIds: ['team-mine'],
      fixtures: [
        fixture({ id: 'tm-ok', gameId: 'game-ok' }),
        fixture({ id: 'tm-other-league', gameId: 'game-other-league', leagueId: 'league-2' }),
        fixture({ id: 'tm-cancelled', gameId: 'game-cancelled', status: 'cancelled' }),
        fixture({
          id: 'tm-deleted',
          gameId: 'game-deleted',
          deletedAt: new Date('2026-09-01T00:00:00.000Z'),
        }),
      ],
      participants: [
        { id: 'p-ok', gameId: 'game-ok' },
        { id: 'p-other-league', gameId: 'game-other-league' },
        { id: 'p-cancelled', gameId: 'game-cancelled' },
        { id: 'p-deleted', gameId: 'game-deleted' },
      ],
    });

    const result = await service.listClaimableFixtures(user, 'league-1');

    expect(result.fixtures.map((row) => row.teamMatchId)).toEqual(['tm-ok']);
  });

  /**
   * R5 medium — 리그는 `generateFixtures` 가 시즌 전체 대진을 한 번에 만들면서 양 팀
   * 활성 멤버 전원을 자동 로스터 참가자로 함께 만든다. 그래서 **아직 열리지도 않은
   * 대진은 예외 없이 "미연결 참가자 가득"** 으로 잡히고, 걸러내지 않으면 시즌 초 배너가
   * 통째로 미래 경기로 채워진다 — "이 리그에서 뛰었는데 내 기록이 없나요?" 가 뛴 적이
   * 없는(있을 수 없는) 경기를 가리키게 된다.
   */
  it('결과가 아직 확정되지 않은 대진은 안내하지 않는다 (미래 대진·결과 미입력 종료 경기)', async () => {
    const { service } = makeService({
      myTeamIds: ['team-mine'],
      fixtures: [
        fixture({ id: 'tm-played', gameId: 'game-played' }),
        // 3주 뒤 대진 — 로스터 참가자는 이미 만들어져 있지만 아무도 뛴 적이 없다.
        fixture({
          id: 'tm-future',
          gameId: 'game-future',
          startAt: new Date('2026-09-19T10:00:00.000Z'),
          officialRevisionId: null,
        }),
        // 이미 끝났지만 결과가 아직 확정되지 않았다 — 지금 연결해도 순위에 실릴 기록이 없다.
        fixture({
          id: 'tm-awaiting-result',
          gameId: 'game-awaiting-result',
          startAt: new Date('2026-08-25T10:00:00.000Z'),
          officialRevisionId: null,
        }),
      ],
      participants: [
        { id: 'p-played', gameId: 'game-played' },
        { id: 'p-future', gameId: 'game-future' },
        { id: 'p-awaiting', gameId: 'game-awaiting-result' },
      ],
    });

    const result = await service.listClaimableFixtures(user, 'league-1');

    expect(result.fixtures.map((row) => row.teamMatchId)).toEqual(['tm-played']);
  });

  it('이미 연결된 참가자는 세지 않고, 전원 연결된 대진은 목록에서 빠진다', async () => {
    const { service } = makeService({
      myTeamIds: ['team-mine'],
      fixtures: [
        fixture({ id: 'tm-partial', gameId: 'game-partial' }),
        fixture({ id: 'tm-full', gameId: 'game-full' }),
      ],
      participants: [
        { id: 'p-1', gameId: 'game-partial' },
        { id: 'p-2', gameId: 'game-partial' },
        { id: 'p-3', gameId: 'game-full' },
      ],
      links: [
        { participantId: 'p-2', userId: 'someone-else' },
        { participantId: 'p-3', userId: 'someone-else' },
      ],
    });

    const result = await service.listClaimableFixtures(user, 'league-1');

    expect(result.fixtures).toEqual([
      {
        teamMatchId: 'tm-partial',
        title: '가을 리그 tm-partial',
        startAt: '2026-08-01T10:00:00.000Z',
        claimableCount: 1,
      },
    ]);
  });

  it('내가 이미 연결된 대진은 미연결 참가자가 남아 있어도 안내하지 않는다', async () => {
    const { service } = makeService({
      myTeamIds: ['team-mine'],
      fixtures: [fixture({ id: 'tm-1', gameId: 'game-1' })],
      participants: [
        { id: 'p-me', gameId: 'game-1' },
        { id: 'p-teammate', gameId: 'game-1' },
      ],
      // 내 자리는 이미 연결됐다. 남은 미연결 자리는 팀 동료의 것이므로 나를 그리로
      // 보내면 남의 자리를 고르라고 부추기는 셈이다.
      links: [{ participantId: 'p-me', userId: 'me' }],
    });

    const result = await service.listClaimableFixtures(user, 'league-1');

    expect(result.fixtures).toEqual([]);
  });

  it('활성 팀 멤버십이 없으면 대진을 조회하지도 않는다', async () => {
    const { service, prisma } = makeService({ myTeamIds: [] });

    await expect(service.listClaimableFixtures(user, 'league-1')).resolves.toEqual({
      leagueId: 'league-1',
      fixtures: [],
    });
    expect(prisma.v1TeamMatch.findMany).not.toHaveBeenCalled();
  });

  it('대진이 여러 개여도 참가자·연결 조회는 각각 한 번뿐이다 (N+1 금지)', async () => {
    const { service, prisma } = makeService({
      myTeamIds: ['team-mine'],
      fixtures: [
        fixture({ id: 'tm-1', gameId: 'game-1', startAt: new Date('2026-08-01T10:00:00.000Z') }),
        fixture({ id: 'tm-2', gameId: 'game-2', startAt: new Date('2026-08-08T10:00:00.000Z') }),
        fixture({ id: 'tm-3', gameId: 'game-3', startAt: new Date('2026-08-15T10:00:00.000Z') }),
      ],
      participants: [
        { id: 'p-1', gameId: 'game-1' },
        { id: 'p-2', gameId: 'game-2' },
        { id: 'p-3', gameId: 'game-3' },
      ],
    });

    const result = await service.listClaimableFixtures(user, 'league-1');

    expect(result.fixtures).toHaveLength(3);
    expect(prisma.v1GameParticipant.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.v1ParticipantIdentityLinkCurrent.findMany).toHaveBeenCalledTimes(1);
  });
});
