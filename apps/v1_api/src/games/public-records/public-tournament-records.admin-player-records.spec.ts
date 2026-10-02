import type { PrismaService } from '../../prisma/prisma.service';
import type { TournamentStaffAccessService } from '../../tournaments/staff/tournament-staff-access.service';
import { PublicTournamentRecordsService } from './public-tournament-records.service';

/**
 * 회고 STATS-3 — 어드민 비게이팅 랭킹 계약.
 * 공개 랭킹과 달리 동의 테이블을 아예 조회하지 않아야 하고(미동의 1위가 빠지면
 * 틀린 수상 추천이 된다), 계정 미연결 참가자는 정규화 이름으로 경기 간 합산된다.
 */
function buildPrisma(options: {
  tournamentExists?: boolean;
  games?: Array<{ currentOfficialRevisionId: string | null }>;
  invalidTeamMatches?: Array<{ id: string; gameSourceType: string | null; detailsTournamentId: string | null }>;
  participantRows?: Array<{
    participantId: string;
    goals: number;
    assists: number;
    resultRevision: { officialAt: Date | null };
  }>;
  participants?: Array<{ id: string; userId: string | null; displayNameSnapshot: string; sideId: string }>;
  sides?: Array<{ id: string; teamId: string | null }>;
  teams?: Array<{ id: string; name: string }>;
}) {
  const consentFindMany = jest.fn().mockResolvedValue([]);
  const prisma = {
    v1Tournament: { findFirst: jest.fn().mockResolvedValue(options.tournamentExists === false ? null : { id: 'tour-1' }) },
    v1Game: {
      findMany: jest.fn().mockResolvedValue(options.games ?? []),
    },
    v1TeamMatch: {
      findMany: jest.fn().mockResolvedValue((options.invalidTeamMatches ?? []).map((row) => ({
        id: row.id,
        game: row.gameSourceType === null ? null : { sourceType: row.gameSourceType },
        tournamentDetails: row.detailsTournamentId === null ? null : { tournamentId: row.detailsTournamentId },
      }))),
    },
    v1GameResultParticipant: { findMany: jest.fn().mockResolvedValue(options.participantRows ?? []) },
    v1GameParticipant: { findMany: jest.fn().mockResolvedValue(options.participants ?? []) },
    v1GameSide: { findMany: jest.fn().mockResolvedValue(options.sides ?? []) },
    v1Team: { findMany: jest.fn().mockResolvedValue(options.teams ?? []) },
    v1ParticipantIdentityLinkCurrent: { findMany: consentFindMany },
    v1UserRecordConsent: { findMany: consentFindMany },
    v1ParticipantConsentSnapshot: { findMany: consentFindMany },
  } as unknown as PrismaService;
  return { prisma, consentFindMany };
}

const access = {} as TournamentStaffAccessService;
const OFFICIAL = { officialAt: new Date('2026-08-02T00:00:00Z') };

describe('PublicTournamentRecordsService.getPlayerRecordsForAdmin', () => {
  it('404s for a nonexistent tournament instead of returning an empty 200', async () => {
    const { prisma } = buildPrisma({ tournamentExists: false });
    await expect(
      new PublicTournamentRecordsService(prisma, access).getPlayerRecordsForAdmin('nope'),
    ).rejects.toMatchObject({ response: { code: 'TOURNAMENT_NOT_FOUND' } });
  });

  it('queries only canonical TeamMatch games for administrator records', async () => {
    const { prisma } = buildPrisma({ games: [] });
    await new PublicTournamentRecordsService(prisma, access).getPlayerRecordsForAdmin('tour-1');
    const gameQueries = (prisma as unknown as { v1Game: { findMany: jest.Mock } }).v1Game.findMany;
    expect(gameQueries.mock.calls).toHaveLength(1);
    expect(gameQueries.mock.calls[0][0].where).toMatchObject({
      sourceType: 'TEAM_MATCH',
      teamMatch: {
        tournamentId: 'tour-1',
        leagueId: null,
        deletedAt: null,
        tournamentDetails: { is: { tournamentId: 'tour-1' } },
      },
    });
  });

  it('fails closed when a canonical TeamMatch has missing or mismatched Details', async () => {
    const { prisma } = buildPrisma({
      invalidTeamMatches: [
        { id: 'team-match-missing-details', gameSourceType: 'TEAM_MATCH', detailsTournamentId: null },
        { id: 'team-match-missing-game', gameSourceType: null, detailsTournamentId: 'tour-1' },
        { id: 'team-match-wrong-details', gameSourceType: 'TEAM_MATCH', detailsTournamentId: 'other-tour' },
        { id: 'team-match-wrong-source', gameSourceType: 'TOURNAMENT_FIXTURE', detailsTournamentId: 'tour-1' },
      ],
    });
    await expect(
      new PublicTournamentRecordsService(prisma, access).getPlayerRecordsForAdmin('tour-1'),
    ).rejects.toMatchObject({
      response: {
        code: 'TOURNAMENT_MATCH_GAME_MISSING',
        details: { teamMatchIds: ['team-match-missing-details', 'team-match-missing-game', 'team-match-wrong-details', 'team-match-wrong-source'] },
      },
    });
  });

  it('aggregates without consent gating and never touches the consent tables', async () => {
    const { prisma, consentFindMany } = buildPrisma({
      games: [{ currentOfficialRevisionId: 'rev-1' }],
      participantRows: [
        { participantId: 'p-1', goals: 4, assists: 1, resultRevision: OFFICIAL },
      ],
      participants: [
        { id: 'p-1', userId: 'user-unconsented', displayNameSnapshot: '미동의왕', sideId: 'side-1' },
      ],
      sides: [{ id: 'side-1', teamId: 'team-1' }],
      teams: [{ id: 'team-1', name: '홈팀FC' }],
    });
    const result = await new PublicTournamentRecordsService(prisma, access).getPlayerRecordsForAdmin('tour-1');
    expect(result.goals).toEqual([
      { userId: 'user-unconsented', name: '미동의왕', teamName: '홈팀FC', goals: 4, assists: 1 },
    ]);
    expect(consentFindMany).not.toHaveBeenCalled();
  });

  it('merges unlinked participants across games by normalised name snapshot', async () => {
    const { prisma } = buildPrisma({
      games: [{ currentOfficialRevisionId: 'rev-1' }, { currentOfficialRevisionId: 'rev-2' }],
      participantRows: [
        { participantId: 'p-g1', goals: 2, assists: 0, resultRevision: OFFICIAL },
        { participantId: 'p-g2', goals: 1, assists: 0, resultRevision: OFFICIAL },
      ],
      participants: [
        { id: 'p-g1', userId: null, displayNameSnapshot: '홍길동', sideId: 'side-1' },
        { id: 'p-g2', userId: null, displayNameSnapshot: ' 홍길동 ', sideId: 'side-2' },
      ],
      sides: [
        { id: 'side-1', teamId: 'team-1' },
        { id: 'side-2', teamId: 'team-1' },
      ],
      teams: [{ id: 'team-1', name: '홈팀FC' }],
    });
    const result = await new PublicTournamentRecordsService(prisma, access).getPlayerRecordsForAdmin('tour-1');
    expect(result.goals).toEqual([
      { userId: null, name: expect.stringContaining('홍길동'), teamName: '홈팀FC', goals: 3, assists: 0 },
    ]);
  });

  it('keeps linked and name-only participants as separate rows even with the same name', async () => {
    const { prisma } = buildPrisma({
      games: [{ currentOfficialRevisionId: 'rev-1' }],
      participantRows: [
        { participantId: 'p-linked', goals: 2, assists: 0, resultRevision: OFFICIAL },
        { participantId: 'p-named', goals: 1, assists: 0, resultRevision: OFFICIAL },
      ],
      participants: [
        { id: 'p-linked', userId: 'user-a', displayNameSnapshot: '김철수', sideId: 'side-1' },
        { id: 'p-named', userId: null, displayNameSnapshot: '김철수', sideId: 'side-1' },
      ],
      sides: [{ id: 'side-1', teamId: null }],
    });
    const result = await new PublicTournamentRecordsService(prisma, access).getPlayerRecordsForAdmin('tour-1');
    expect(result.goals.map((row) => [row.userId, row.goals])).toEqual([
      ['user-a', 2],
      [null, 1],
    ]);
  });
});
