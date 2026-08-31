import { V1GameLineupState, V1GameSideKey, V1GameSourceType } from '@prisma/client';
import { OperationAuditWriterService } from '../../src/common/audit/operation-audit-writer.service';
import { GameTakeoverService } from '../../src/games/game-takeover.service';
import { canonicalGameCommandPayloadHash, GamesService } from '../../src/games/games.service';
import type { GameCommandContext, GameSourceCreationInput } from '../../src/games/games.types';
import { PrismaService } from '../../src/prisma/prisma.service';

/**
 * [P1-b] 대회 경기(TOURNAMENT_FIXTURE)의 참가자 행이 라인업 저장에 **살아남는지** 검증한다.
 *
 * 예전에는 `saveLineup` 한 번에 새 라인업 리비전 + 새 `V1GameParticipant` 한 벌이 통째로
 * 생겼다. participant 행에는 그 행에만 매달린 것들이 있다:
 *   ① `arrivedAt` -- 현장 명단 검인(1차 대회 회고: "안 온 사람 확인이 어려움")
 *   ② `V1GameResultParticipant.participantId` -- 공식 기록의 개인 귀속
 *   ③ `V1ParticipantIdentityLink*.participantId` -- 개인 기록 공개의 출발점
 * 즉 **명단을 한 번 더 저장하는 것만으로** 검인이 사라지고 신원 연결이 고아가 됐다.
 *
 * 이 스펙이 없으면 회귀를 아무것도 못 잡는다. 기존 라인업 통합 스펙은 전부 "저장이
 * 성공했는가 / 리비전이 올랐는가 / 링크가 생겼는가"만 보고, **같은 사람의 행이 그대로인지**는
 * 어디서도 확인하지 않는다 -- participant.id 를 저장 전후로 비교하는 단언이 레포에 0건이었다.
 * 그래서 행을 새로 만들어도 모든 스펙이 green 이었다.
 *
 * 두 경로를 각각 못박는다. 둘은 **의도적으로 다르게** 동작하므로 한쪽만 보면 안 된다:
 *
 *  A) 최신이 DRAFT -- 행을 **재사용**한다. participant.id 가 그대로여야 하고, 라인업 행
 *     개수가 안 늘어야 하고, revision 은 **그대로 올라야 한다**(리비전이 이 경로의 유일한
 *     낙관적 잠금이라 고정하면 동시 저장 가드가 껍데기가 된다).
 *  B) 최신이 SUBMITTED -- 제출본 스냅샷을 지켜야 하므로 **새 행**을 만든다. 대신 `arrivedAt`
 *     을 이월한다. 검인은 킥오프 직전이라 제출 **뒤**에 일어나는 것이 정상이고, 이월하지
 *     않으면 뒤늦은 명단 수정 한 번에 이미 받아둔 검인이 통째로 사라진다.
 */
const ids = {
  platformOps: '6b000000-0000-4000-8000-000000000001',
  managerUser: '6b000000-0000-4000-8000-000000000002',
  memberUser: '6b000000-0000-4000-8000-000000000003',
  sport: '6b000000-0000-4000-8000-000000000010',
  region: '6b000000-0000-4000-8000-000000000011',
  hostTeam: '6b000000-0000-4000-8000-000000000020',
  awayTeam: '6b000000-0000-4000-8000-000000000021',
  tournament: '6b000000-0000-4000-8000-000000000030',
  hostRegistration: '6b000000-0000-4000-8000-000000000031',
  awayRegistration: '6b000000-0000-4000-8000-000000000032',
  fixture: '6b000000-0000-4000-8000-000000000040',
} as const;

const prisma = new PrismaService();
const games = new GamesService(prisma, new OperationAuditWriterService(), new GameTakeoverService());

const authUser = (id: string) => ({
  id,
  email: `${id}@example.test`,
  accountStatus: 'active' as const,
  onboardingStatus: 'completed' as const,
});

function creationContext(commandId: string, payload: unknown): GameCommandContext {
  return {
    actor: { actorType: 'USER', actorUserId: ids.platformOps, role: 'platform_ops' },
    expectedVersion: 0,
    durableCommandId: commandId,
    payloadHash: canonicalGameCommandPayloadHash(payload),
  };
}

describe('[P1-b] saveLineup pins tournament participants to the roster instead of re-creating them', () => {
  let pinnedMinPlayers: number;
  let gameId: string;
  let hostSideId: string;

  /** 검증 대상 외의 자리는 항상 게스트로 채워 사이즈 게이트와 무관하게 만든다. */
  function guests(count: number, label: string) {
    return Array.from({ length: count }, (_, index) => ({
      displayNameSnapshot: `${label} guest ${index + 1}`,
      jerseyNumber: 50 + index,
      started: true,
    }));
  }

  /**
   * 이 사이드의 **최신 라인업에 속한** 참가자를 이름으로 찾는다 -- id 비교가 이 스펙의
   * 핵심이라 매번 새로 읽는다.
   *
   * 반드시 `lineupId` 로 좁혀야 한다: 제출본 위에 새 리비전이 열리면 같은 이름의 행이 두 개
   * (제출본 스냅샷 + 새 행) 공존하고, 정렬 없는 `findFirst` 는 그중 **옛 행**을 집어 온다.
   * 실제로 이 스펙을 처음 돌렸을 때 그 때문에 B 가 거짓 실패했다.
   */
  async function trackedParticipant() {
    const latest = (await sideLineups()).at(-1);
    if (latest === undefined) throw new Error('expected at least one lineup for the side');
    return prisma.v1GameParticipant.findFirstOrThrow({
      where: { gameId, sideId: hostSideId, lineupId: latest.id, displayNameSnapshot: 'Pinned Member' },
    });
  }

  async function sideLineups() {
    return prisma.v1GameLineup.findMany({
      where: { gameId, sideId: hostSideId },
      orderBy: { revision: 'asc' },
      select: { id: true, revision: true, state: true },
    });
  }

  async function latestRevision(): Promise<number> {
    const rows = await sideLineups();
    return rows.at(-1)?.revision ?? 0;
  }

  async function participantCount(): Promise<number> {
    return prisma.v1GameParticipant.count({ where: { gameId, sideId: hostSideId } });
  }

  /** 항상 같은 명단을 보낸다 -- 달라지는 것은 저장 횟수뿐이어야 한다. */
  async function saveRoster(commandId: string) {
    return games.saveLineup(authUser(ids.platformOps), gameId, hostSideId, commandId, {
      expectedVersion: await latestRevision(),
      clientCommandId: commandId,
      participants: [
        {
          displayNameSnapshot: 'Pinned Member',
          jerseyNumber: 7,
          position: 'GOLEIRO',
          started: true,
          userId: ids.memberUser,
        },
        ...guests(pinnedMinPlayers - 1, 'pin'),
      ],
    });
  }

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for the P1-b participant pinning spec');
    }
    await prisma.$connect();

    const config = await prisma.v1CompetitionConfigVersion.findFirst({
      where: { name: 'futsal-v1', status: 'ACTIVE' },
      orderBy: { version: 'desc' },
    });
    if (config === null) {
      throw new Error('futsal-v1 competition config preset is required (run competition-config-backfill.cli.ts)');
    }
    pinnedMinPlayers = (config.lineup as { minPlayers: number }).minPlayers;

    await prisma.v1User.createMany({
      data: [ids.platformOps, ids.managerUser, ids.memberUser].map((id, index) => ({
        id,
        email: `p1b-pin-${index}@example.test`,
        accountStatus: 'active',
        onboardingStatus: 'completed',
      })),
    });
    await prisma.v1AdminUser.create({
      data: { userId: ids.platformOps, adminRole: 'owner', status: 'active' },
    });
    await prisma.v1Sport.create({ data: { id: ids.sport, code: 'futsal', name: 'P1b pin futsal' } });
    await prisma.v1Region.create({
      data: { id: ids.region, code: 'P1B_PIN_REGION', name: 'P1b pin region', level: 1 },
    });
    await prisma.v1Team.createMany({
      data: [
        {
          id: ids.hostTeam,
          ownerUserId: ids.managerUser,
          sportId: ids.sport,
          regionId: ids.region,
          name: 'P1b pin host',
        },
        {
          id: ids.awayTeam,
          ownerUserId: ids.platformOps,
          sportId: ids.sport,
          regionId: ids.region,
          name: 'P1b pin away',
        },
      ],
    });
    await prisma.v1TeamMembership.createMany({
      data: [
        { teamId: ids.hostTeam, userId: ids.managerUser, role: 'manager', status: 'active' },
        { teamId: ids.hostTeam, userId: ids.memberUser, role: 'member', status: 'active' },
      ],
    });
    await prisma.v1Tournament.create({
      data: { id: ids.tournament, sportId: ids.sport, title: 'P1b pin tournament' },
    });
    await prisma.v1TournamentRegistration.createMany({
      data: [
        {
          id: ids.hostRegistration,
          tournamentId: ids.tournament,
          teamId: ids.hostTeam,
          appliedByUserId: ids.managerUser,
          status: 'confirmed',
        },
        {
          id: ids.awayRegistration,
          tournamentId: ids.tournament,
          teamId: ids.awayTeam,
          appliedByUserId: ids.platformOps,
          status: 'confirmed',
        },
      ],
    });
    await prisma.v1TournamentFixture.create({
      data: {
        id: ids.fixture,
        tournamentId: ids.tournament,
        round: 'group',
        fixtureNumber: 1,
        competitionConfigVersionId: config.id,
        homeRegistrationId: ids.hostRegistration,
        awayRegistrationId: ids.awayRegistration,
      },
    });

    const input: GameSourceCreationInput = {
      sourceType: V1GameSourceType.TOURNAMENT_FIXTURE,
      sourceId: ids.fixture,
      competitionConfigVersionId: config.id,
      sides: [
        { sideKey: V1GameSideKey.HOME, teamId: ids.hostTeam, displayNameSnapshot: 'P1b pin host' },
        { sideKey: V1GameSideKey.AWAY, teamId: ids.awayTeam, displayNameSnapshot: 'P1b pin away' },
      ],
      participants: [],
    };
    const created = await prisma.$transaction((tx) =>
      games.createFromSourceInTransaction(tx, input, creationContext('p1b-pin-source', input)),
    );
    gameId = created.gameId;
    hostSideId = (await prisma.v1GameSide.findFirstOrThrow({ where: { gameId, sideKey: V1GameSideKey.HOME } })).id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // ── A) 최신이 DRAFT: 행을 재사용한다 ───────────────────────────────────────────
  it('A: 저장을 반복해도 같은 사람의 participant.id 와 검인 기록(arrivedAt)이 그대로다', async () => {
    await saveRoster('p1b-pin-first');
    const first = await trackedParticipant();

    // 현장 검인을 실제 경로와 같은 모양으로 찍는다(setParticipantArrival 이 쓰는 컬럼).
    const arrivedAt = new Date('2026-08-30T09:00:00.000Z');
    await prisma.v1GameParticipant.update({ where: { id: first.id }, data: { arrivedAt } });

    const countBefore = await participantCount();
    await saveRoster('p1b-pin-second');
    const second = await trackedParticipant();

    // 이 스펙의 핵심 계약: 행이 갈리지 않는다.
    expect(second.id).toBe(first.id);
    expect(second.arrivedAt).toEqual(arrivedAt);
    // 참가자가 누적되지 않는다 -- 예전에는 저장 한 번에 한 벌씩 늘었다.
    expect(await participantCount()).toBe(countBefore);
  });

  it('A: 재사용해도 라인업 행은 하나뿐이고 revision 은 계속 올라간다 (낙관적 잠금 유지)', async () => {
    const before = await sideLineups();
    const revisionBefore = before.at(-1)?.revision ?? 0;

    const saved = await saveRoster('p1b-pin-third');

    const after = await sideLineups();
    // 행이 안 늘어난다 = 재사용됐다.
    expect(after).toHaveLength(before.length);
    // 그런데 revision 은 올라간다 -- 이걸 고정하면 expectedVersion 가드(저장·제출 두 곳)가
    // 살아는 있고 아무것도 못 잡는 상태가 된다. 클라이언트도 이 증가를 전제로 짜여 있다.
    expect(saved.lineupRevision).toBe(revisionBefore + 1);
    expect(after.at(-1)?.revision).toBe(revisionBefore + 1);
    expect(after.at(-1)?.id).toBe(before.at(-1)?.id);
  });

  // ── B) 최신이 SUBMITTED: 새 행 + arrivedAt 이월 ────────────────────────────────
  it('B: 제출 뒤 다시 저장하면 제출본은 남고, 새 행에 검인 기록이 이월된다', async () => {
    const submittedLineup = (await sideLineups()).at(-1);
    if (submittedLineup === undefined) throw new Error('expected a lineup to submit');

    // 제출 상태를 만든다(제출 커맨드는 takeover 등 별도 계약이 있어 상태만 직접 맞춘다 --
    // 이 스펙이 검증하는 것은 "최신이 SUBMITTED 일 때 saveLineup 이 어떻게 갈라지는가"다).
    await prisma.v1GameLineup.update({
      where: { id: submittedLineup.id },
      data: { state: V1GameLineupState.SUBMITTED },
    });

    const beforeParticipant = await trackedParticipant();
    const arrivedAt = new Date('2026-08-30T10:30:00.000Z');
    await prisma.v1GameParticipant.update({ where: { id: beforeParticipant.id }, data: { arrivedAt } });

    const lineupsBefore = await sideLineups();
    await saveRoster('p1b-pin-after-submit');
    const lineupsAfter = await sideLineups();

    // 제출본은 그대로 남아야 한다 -- 엄격 셀렉터가 이걸 계속 집어내야 공식 결과가 안 빈다.
    expect(lineupsAfter).toHaveLength(lineupsBefore.length + 1);
    expect(lineupsAfter.find((row) => row.id === submittedLineup.id)?.state).toBe(V1GameLineupState.SUBMITTED);

    // 새 행이므로 participant.id 는 갈린다. 그러나 검인은 따라와야 한다.
    const afterParticipant = await trackedParticipant();
    expect(afterParticipant.id).not.toBe(beforeParticipant.id);
    expect(afterParticipant.arrivedAt).toEqual(arrivedAt);

    // 제출본 행의 참가자도 그대로 살아 있어야 한다(스냅샷).
    expect(
      await prisma.v1GameParticipant.count({ where: { lineupId: submittedLineup.id } }),
    ).toBe(pinnedMinPlayers);
  });
});
