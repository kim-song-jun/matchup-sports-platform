/**
 * Task 163 BE-3 — 명단 = 출전자 (정본 §3).
 *
 * 선발/후보 구분이 사라졌다. 예전엔 팀 매치 라인업만 `position = 'BENCH'` 라는 문자열
 * 센티널로 후보를 표시했고, 같은 컬럼을 대회 경기는 실제 포지션 코드로 썼다 — 읽는 쪽마다
 * 소스별 분기가 복제됐고 그중 하나는 상수를 import 하지 않고 **값을 복사**해 갖고 있었다.
 * 마이그레이션 `20260902000000_v1_lineup_bench_to_started` 가 그 구분을 지웠다.
 *
 * ## 이 파일이 지키는 계약 셋
 *
 * 1. **저장은 명단 하나를 받는다.** `participants` 로 보내든 옛 `starters`/`bench` 두 칸으로
 *    보내든 결과가 같아야 한다 — 어느 배열에 담겼는지가 저장에 영향을 주면 후보 개념이
 *    이름만 바꿔 살아난 것이다.
 * 2. **센티널이 되살아나지 않는다.** 어떤 행의 `position` 도 `'BENCH'` 가 아니다.
 * 3. **복사는 원본을 그대로 옮긴다.** 정정 요청이 만드는 복사본이 `started` 를 안 실으면
 *    스키마 기본값(true)이 원본 값을 덮는다. 지금은 모든 행이 true 라 눈에 안 띄지만,
 *    그 경로가 **값을 지어내는지 옮기는지**는 여전히 갈리는 문제다 — 이 복사본이 그 사이드의
 *    최신 리비전이 되고 결과 입력의 모집단이 되기 때문이다. 그래서 아래 3번 테스트는
 *    `started=false` 인 행을 **직접 심어** 복사가 그것을 보존하는지 본다.
 *
 * ⚠️ 변이로 red 가 되는 것과 안 되는 것을 분명히 해 둔다:
 *   · 생성 경로의 `started: true` 를 **`false` 로** 바꾸면 → 1번이 red
 *   · 생성 경로의 `started: true` 줄을 **지우면** → green (스키마 기본값이 같은 값이라
 *     관측 결과가 안 변한다). 그 줄은 "값이 무엇인지 코드에서 읽히게" 두는 것이지
 *     동작을 바꾸지 않는다.
 *   · 복사 경로의 `started: participant.started` 를 **지우면** → 3번이 red
 *
 * ⚠️ 같은 디렉터리의 `team-match-lineup.integration-spec.ts` 는 `jest.config.ts` 의
 * `testPathIgnorePatterns` 에 있어 **한 번도 돌지 않는다**(선재 bit-rot, 그 파일 주석 참고).
 * 그 파일에 얹으면 이 검증도 같이 안 돈다 — 그래서 별도 파일이다.
 */
import { V1GameLineupState, V1GameSideKey, V1GameSourceType } from '@prisma/client';
import { OperationAuditWriterService } from '../../src/common/audit/operation-audit-writer.service';
import { GameTakeoverService } from '../../src/games/game-takeover.service';
import { canonicalGameCommandPayloadHash, GamesService } from '../../src/games/games.service';
import type { GameCommandContext, GameSourceCreationInput } from '../../src/games/games.types';
import { PrismaService } from '../../src/prisma/prisma.service';
import { TeamMatchLineupService } from '../../src/team-matches/team-match-lineup.service';

const ids = {
  hostOwner: '6a000000-0000-4000-8000-000000000001',
  hostP2: '6a000000-0000-4000-8000-000000000002',
  hostP3: '6a000000-0000-4000-8000-000000000003',
  opponentOwner: '6a000000-0000-4000-8000-000000000004',
  sport: '6a000000-0000-4000-8000-000000000010',
  region: '6a000000-0000-4000-8000-000000000011',
  hostTeam: '6a000000-0000-4000-8000-000000000020',
  opponentTeam: '6a000000-0000-4000-8000-000000000021',
  teamMatch: '6a000000-0000-4000-8000-000000000030',
} as const;

const prisma = new PrismaService();
const games = new GamesService(prisma, new OperationAuditWriterService(), new GameTakeoverService());
const service = new TeamMatchLineupService(prisma, new OperationAuditWriterService());

const authUser = (id: string) => ({
  id,
  email: `${id}@example.test`,
  accountStatus: 'active' as const,
  onboardingStatus: 'completed' as const,
});

/** 이 사이드의 현재(최신) 리비전에 달린 참가자를, 이름 → 행 으로. */
async function currentRosterByName(sideId: string) {
  const lineup = await prisma.v1GameLineup.findFirstOrThrow({
    where: { sideId },
    orderBy: { revision: 'desc' },
    select: { id: true, revision: true, state: true },
  });
  const rows = await prisma.v1GameParticipant.findMany({
    where: { lineupId: lineup.id },
    select: { displayNameSnapshot: true, started: true, position: true },
  });
  return {
    lineupId: lineup.id,
    revision: lineup.revision,
    state: lineup.state,
    byName: new Map(rows.map((row) => [row.displayNameSnapshot, row])),
  };
}

/**
 * 저장에 넣을 `expectedVersion` 은 **읽어서** 쓴다. 하드코딩한 0 은 틀린다 —
 * 게임 생성(`createFromSourceInTransaction`)이 사이드마다 자동 로스터를 리비전 1 로
 * 이미 만들어 두기 때문에 첫 저장부터 현재 버전은 0 이 아니다.
 */
async function currentVersion(userId: string): Promise<number> {
  const view = await service.getLineup(authUser(userId), ids.teamMatch);
  return view.version;
}

describe('Task 163 BE-3 — 팀 매치 라인업의 명단은 출전자 전원이다', () => {
  let hostSideId: string;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for Task 163 BE-3 verification');
    }
    await prisma.$connect();
    const config = await prisma.v1CompetitionConfigVersion.findFirst({
      where: { name: 'futsal-v1', status: 'ACTIVE' },
      orderBy: { version: 'desc' },
    });
    if (config === null) throw new Error('futsal-v1 competition config preset is required');

    await prisma.v1User.createMany({
      data: [ids.hostOwner, ids.hostP2, ids.hostP3, ids.opponentOwner].map((id, index) => ({
        id,
        email: `task163-be3-${index}@example.test`,
        accountStatus: 'active' as const,
        onboardingStatus: 'completed' as const,
      })),
    });
    await prisma.v1Sport.create({ data: { id: ids.sport, code: 'futsal', name: 'Task 163 BE-3 Futsal' } });
    await prisma.v1Region.create({
      data: { id: ids.region, code: 'TASK163_BE3_REGION', name: 'Task 163 BE-3 Region', level: 1 },
    });
    await prisma.v1Team.createMany({
      data: [
        {
          id: ids.hostTeam,
          ownerUserId: ids.hostOwner,
          sportId: ids.sport,
          regionId: ids.region,
          name: 'Task 163 BE-3 Host',
        },
        {
          id: ids.opponentTeam,
          ownerUserId: ids.opponentOwner,
          sportId: ids.sport,
          regionId: ids.region,
          name: 'Task 163 BE-3 Opponent',
        },
      ],
    });
    await prisma.v1TeamMembership.createMany({
      data: [
        { teamId: ids.hostTeam, userId: ids.hostOwner, role: 'owner', status: 'active' },
        { teamId: ids.hostTeam, userId: ids.hostP2, role: 'member', status: 'active' },
        { teamId: ids.hostTeam, userId: ids.hostP3, role: 'member', status: 'active' },
        { teamId: ids.opponentTeam, userId: ids.opponentOwner, role: 'owner', status: 'active' },
      ],
    });
    // 저장은 경기 시작 전에만 허용된다(LINEUP_DEADLINE_PASSED) — 미래로 잡는다.
    const startAt = new Date(Date.now() + 3 * 60 * 60 * 1000);
    await prisma.v1TeamMatch.create({
      data: {
        id: ids.teamMatch,
        hostTeamId: ids.hostTeam,
        createdByUserId: ids.hostOwner,
        sportId: ids.sport,
        regionId: ids.region,
        title: 'Task 163 BE-3 lineup match',
        placeName: 'Task 163 court',
        startAt,
        approvedApplicantTeamId: ids.opponentTeam,
        competitionConfigVersionId: config.id,
      },
    });
    const input: GameSourceCreationInput = {
      sourceType: V1GameSourceType.TEAM_MATCH,
      sourceId: ids.teamMatch,
      competitionConfigVersionId: config.id,
      sides: [
        { sideKey: V1GameSideKey.HOME, teamId: ids.hostTeam, displayNameSnapshot: 'Task 163 BE-3 Host' },
        { sideKey: V1GameSideKey.AWAY, teamId: ids.opponentTeam, displayNameSnapshot: 'Task 163 BE-3 Opponent' },
      ],
      participants: [],
    };
    const context: GameCommandContext = {
      actor: { actorType: 'USER', actorUserId: ids.hostOwner, role: 'team_owner' },
      expectedVersion: 0,
      durableCommandId: 'task163-be3-source',
      payloadHash: canonicalGameCommandPayloadHash(input),
    };
    await prisma.$transaction((tx) => games.createFromSourceInTransaction(tx, input, context));

    const game = await prisma.v1Game.findFirstOrThrow({
      where: { teamMatchId: ids.teamMatch },
      select: { id: true },
    });
    const side = await prisma.v1GameSide.findFirstOrThrow({
      where: { gameId: game.id, sideKey: V1GameSideKey.HOME },
      select: { id: true },
    });
    hostSideId = side.id;
  });

  afterAll(async () => {
    const game = await prisma.v1Game.findFirst({ where: { teamMatchId: ids.teamMatch }, select: { id: true } });
    if (game !== null) {
      // 신원 연결 테이블은 gameId 를 갖고 있지 않다 — participantId 로만 지울 수 있다.
      const participantIds = (
        await prisma.v1GameParticipant.findMany({ where: { gameId: game.id }, select: { id: true } })
      ).map((row) => row.id);
      await prisma.v1ParticipantIdentityLinkCurrent.deleteMany({
        where: { participantId: { in: participantIds } },
      });
      await prisma.v1ParticipantIdentityLinkEvent.deleteMany({
        where: { participantId: { in: participantIds } },
      });
      await prisma.v1GameParticipant.deleteMany({ where: { gameId: game.id } });
      await prisma.v1GameLineup.deleteMany({ where: { gameId: game.id } });
      // 라인업 저장이 기본 공개 시각 정책을 만든다(ensureDefaultPublicLineupTime) —
      // 먼저 지우지 않으면 v1_visibility_game_fk 로 게임 삭제가 막힌다.
      await prisma.v1GameVisibilityPolicy.deleteMany({ where: { gameId: game.id } });
      await prisma.v1GameSide.deleteMany({ where: { gameId: game.id } });
      await prisma.v1Game.deleteMany({ where: { id: game.id } });
    }
    await prisma.v1TeamMatch.deleteMany({ where: { id: ids.teamMatch } });
    await prisma.v1TeamMembership.deleteMany({ where: { teamId: { in: [ids.hostTeam, ids.opponentTeam] } } });
    await prisma.v1Team.deleteMany({ where: { id: { in: [ids.hostTeam, ids.opponentTeam] } } });
    await prisma.v1Region.deleteMany({ where: { id: ids.region } });
    await prisma.v1Sport.deleteMany({ where: { id: ids.sport } });
    await prisma.v1User.deleteMany({
      where: { id: { in: [ids.hostOwner, ids.hostP2, ids.hostP3, ids.opponentOwner] } },
    });
    await prisma.$disconnect();
  });

  it('옛 starters/bench 두 칸으로 보내도 한 명단이 된다 — 전원 started=true, BENCH 센티널 없음', async () => {
    // 프론트가 아직 보내는 모양 그대로. 후보 칸에 담긴 사람도 **출전자**다.
    await service.saveLineup(authUser(ids.hostOwner), ids.teamMatch, 'task163-be3-save', {
      expectedVersion: await currentVersion(ids.hostOwner),
      formation: '2-2',
      starters: [
        { userId: ids.hostOwner, displayName: '팀장', jerseyNumber: 1, goalkeeper: true },
        { userId: ids.hostP2, displayName: '필드', jerseyNumber: 2 },
      ],
      bench: [{ userId: ids.hostP3, displayName: '옛후보칸', jerseyNumber: 3 }],
    });

    const { byName } = await currentRosterByName(hostSideId);
    expect(byName.get('팀장')).toEqual({ displayNameSnapshot: '팀장', started: true, position: 'GK' });
    expect(byName.get('필드')).toEqual({ displayNameSnapshot: '필드', started: true, position: null });
    // ⚠️ 여기가 정본의 핵심 — 후보 칸에 담겨 왔어도 출전자다.
    expect(byName.get('옛후보칸')).toEqual({ displayNameSnapshot: '옛후보칸', started: true, position: null });

    // 폐기한 센티널이 어떤 행에도 되살아나지 않는다.
    expect([...byName.values()].map((row) => row.position)).not.toContain('BENCH');

    // 조회도 명단 하나로 답한다. `bench` 는 옛 클라이언트를 위해 남았지만 언제나 비어 있다.
    const view = await service.getLineup(authUser(ids.hostOwner), ids.teamMatch);
    const names = ['옛후보칸', '팀장', '필드'];
    expect(view.participants.map((entry) => entry.displayName).sort()).toEqual(names);
    // 옛 두 칸도 **같은 명단**을 담는다 — 아직 이 칸을 읽는 프론트가 사람을 잃으면 안 된다.
    // `starters` 를 단언하지 않으면 그 칸을 비워 버리는 변이가 통과한다(실측 확인).
    expect(view.starters.map((entry) => entry.displayName).sort()).toEqual(names);
    expect(view.bench).toEqual([]);
  });

  it('participants 한 칸으로 보내도 같은 결과다 — 어느 배열에 담겼는지는 저장에 영향이 없다', async () => {
    const before = await currentRosterByName(hostSideId);
    await service.saveLineup(authUser(ids.hostOwner), ids.teamMatch, 'task163-be3-save-2', {
      expectedVersion: before.revision,
      formation: '2-2',
      participants: [
        { userId: ids.hostOwner, displayName: '팀장', jerseyNumber: 1, goalkeeper: true },
        { userId: ids.hostP2, displayName: '필드', jerseyNumber: 2 },
        { userId: ids.hostP3, displayName: '옛후보칸', jerseyNumber: 3 },
      ],
    });

    const after = await currentRosterByName(hostSideId);
    expect(after.revision).toBe(before.revision + 1);
    // 앞 테스트(두 칸으로 보낸 것)와 **행 모양이 완전히 같다.**
    expect([...after.byName.entries()].sort()).toEqual([...before.byName.entries()].sort());
  });

  it('정정 요청 복사는 원본 행을 그대로 옮긴다 (started 를 지어내지 않는다)', async () => {
    const before = await currentRosterByName(hostSideId);

    // 마이그레이션 이전에 저장돼 아직 false 로 남아 있는 행을 흉내 낸다. 복사가 `started` 를
    // 안 실으면 스키마 기본값 true 가 이 값을 덮어쓴다 — 그것이 이 테스트가 잡는 것이다.
    await prisma.v1GameParticipant.updateMany({
      where: { lineupId: before.lineupId, displayNameSnapshot: '옛후보칸' },
      data: { started: false },
    });

    await service.submitLineup(authUser(ids.hostOwner), ids.teamMatch, 'task163-be3-submit', {
      expectedVersion: before.revision,
    });
    const submitted = await currentRosterByName(hostSideId);
    expect(submitted.state).toBe(V1GameLineupState.SUBMITTED);

    // 상대팀 팀장이 정정을 요청한다 → 호스트 라인업이 **복사본**으로 다시 열린다.
    await service.requestChange(authUser(ids.opponentOwner), ids.teamMatch, 'task163-be3-change', {
      expectedVersion: submitted.revision,
      reason: '명단 확인 요청',
    });

    const copied = await currentRosterByName(hostSideId);
    // 복사본이 실제로 새 리비전인지 먼저 확인한다 — 같은 리비전을 다시 읽고 있으면
    // 아래 단언이 "복사가 옳다" 가 아니라 "복사가 없었다" 를 통과시킨다.
    expect(copied.revision).toBe(submitted.revision + 1);
    expect(copied.byName.size).toBe(3);
    expect(copied.byName.get('팀장')).toEqual({ displayNameSnapshot: '팀장', started: true, position: 'GK' });
    expect(copied.byName.get('필드')).toEqual({ displayNameSnapshot: '필드', started: true, position: null });
    // ⚠️ 이 한 줄이 복사 경로를 지킨다. `started` 를 안 실으면 true 로 덮여 red.
    expect(copied.byName.get('옛후보칸')).toEqual({
      displayNameSnapshot: '옛후보칸',
      started: false,
      position: null,
    });
  });
});
