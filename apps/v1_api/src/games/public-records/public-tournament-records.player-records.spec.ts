import type { PrismaService } from '../../prisma/prisma.service';
import type { TournamentStaffAccessService } from '../../tournaments/staff/tournament-staff-access.service';
import { PublicTournamentRecordsService } from './public-tournament-records.service';

/**
 * 회고 STATS-1(리그 playerRecords 패턴의 대회 복제) 계약 검증.
 *
 * #707의 교훈대로 동의 판정을 주입하지 않는다 — fake Prisma가
 * `loadParticipantConsentEligibility`의 실제 3쿼리(identity link → user consent →
 * participant snapshot)를 그대로 받아, 배선까지 함께 검증한다.
 */
function buildPrisma(options: {
  bracketPublishedAt?: Date | null;
  games?: Array<{ currentOfficialRevisionId: string | null; visibilityPolicy?: { mode: string } | null }>;
  participantRows?: Array<{
    participantId: string;
    goals: number;
    assists: number;
    resultRevision: { officialAt: Date | null };
  }>;
  identityLinks?: Array<{ participantId: string; userId: string }>;
  userConsents?: Array<{ userId: string; state: string }>;
  participantSnapshots?: Array<{ participantId: string; state: string }>;
  users?: Array<{ id: string; profile: { nickname: string | null; displayName?: string | null; deletedAt?: Date | null } | null }>;
}) {
  return {
    v1Tournament: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'tour-1',
        bracketPublishedAt: options.bracketPublishedAt === undefined ? new Date('2026-08-01T00:00:00Z') : options.bracketPublishedAt,
        bracketPublishScheduledAt: null,
      }),
    },
    v1Game: { findMany: jest.fn().mockResolvedValue(options.games ?? []) },
    v1GameOperationFlag: { findUnique: jest.fn().mockResolvedValue({ value: 'on' }) },
    v1GameResultParticipant: { findMany: jest.fn().mockResolvedValue(options.participantRows ?? []) },
    v1ParticipantIdentityLinkCurrent: { findMany: jest.fn().mockResolvedValue(options.identityLinks ?? []) },
    v1UserRecordConsent: { findMany: jest.fn().mockResolvedValue(options.userConsents ?? []) },
    v1ParticipantConsentSnapshot: { findMany: jest.fn().mockResolvedValue(options.participantSnapshots ?? []) },
    v1User: { findMany: jest.fn().mockResolvedValue(options.users ?? []) },
  } as unknown as PrismaService;
}

const access = {} as TournamentStaffAccessService;
const OFFICIAL = { officialAt: new Date('2026-08-02T00:00:00Z') };

describe('PublicTournamentRecordsService.getPlayerRecords', () => {
  it('aggregates goals and assists per linked+consented user across games, sorted with profileHref', async () => {
    const prisma = buildPrisma({
      games: [
        { currentOfficialRevisionId: 'rev-1', visibilityPolicy: { mode: 'LIVE' } },
        { currentOfficialRevisionId: 'rev-2', visibilityPolicy: { mode: 'LIVE' } },
      ],
      participantRows: [
        { participantId: 'p-a1', goals: 2, assists: 0, resultRevision: OFFICIAL },
        { participantId: 'p-a2', goals: 1, assists: 1, resultRevision: OFFICIAL },
        { participantId: 'p-b1', goals: 0, assists: 3, resultRevision: OFFICIAL },
      ],
      identityLinks: [
        { participantId: 'p-a1', userId: 'user-a' },
        { participantId: 'p-a2', userId: 'user-a' },
        { participantId: 'p-b1', userId: 'user-b' },
      ],
      userConsents: [
        { userId: 'user-a', state: 'GRANTED' },
        { userId: 'user-b', state: 'GRANTED' },
      ],
      users: [
        { id: 'user-a', profile: { nickname: '스트라이커' } },
        { id: 'user-b', profile: { nickname: '플레이메이커' } },
      ],
    });
    const result = await new PublicTournamentRecordsService(prisma, access).getPlayerRecords('tour-1');
    expect(result.goals).toEqual([
      { userId: 'user-a', nickname: '스트라이커', profileHref: '/users/user-a', goals: 3, assists: 1 },
    ]);
    expect(result.assists).toEqual([
      { userId: 'user-b', nickname: '플레이메이커', profileHref: '/users/user-b', goals: 0, assists: 3 },
      { userId: 'user-a', nickname: '스트라이커', profileHref: '/users/user-a', goals: 3, assists: 1 },
    ]);
  });

  it('drops unlinked participants and users without GRANTED consent — the real loader wiring decides', async () => {
    const prisma = buildPrisma({
      games: [{ currentOfficialRevisionId: 'rev-1', visibilityPolicy: { mode: 'LIVE' } }],
      participantRows: [
        { participantId: 'p-linked-consented', goals: 1, assists: 0, resultRevision: OFFICIAL },
        { participantId: 'p-linked-unconsented', goals: 5, assists: 0, resultRevision: OFFICIAL },
        { participantId: 'p-name-only', goals: 4, assists: 0, resultRevision: OFFICIAL },
      ],
      identityLinks: [
        { participantId: 'p-linked-consented', userId: 'user-yes' },
        { participantId: 'p-linked-unconsented', userId: 'user-no' },
      ],
      userConsents: [{ userId: 'user-yes', state: 'GRANTED' }],
      users: [{ id: 'user-yes', profile: { nickname: '동의함' } }],
    });
    const result = await new PublicTournamentRecordsService(prisma, access).getPlayerRecords('tour-1');
    expect(result.goals.map((row) => row.userId)).toEqual(['user-yes']);
  });

  it('honours a per-participant REVOKED snapshot even when the user-level consent is GRANTED', async () => {
    const prisma = buildPrisma({
      games: [{ currentOfficialRevisionId: 'rev-1', visibilityPolicy: { mode: 'LIVE' } }],
      participantRows: [
        { participantId: 'p-revoked', goals: 2, assists: 0, resultRevision: OFFICIAL },
      ],
      identityLinks: [{ participantId: 'p-revoked', userId: 'user-a' }],
      userConsents: [{ userId: 'user-a', state: 'GRANTED' }],
      participantSnapshots: [{ participantId: 'p-revoked', state: 'REVOKED' }],
    });
    const result = await new PublicTournamentRecordsService(prisma, access).getPlayerRecords('tour-1');
    expect(result.goals).toEqual([]);
  });

  it('returns empty lists before the bracket is published, without querying games', async () => {
    const prisma = buildPrisma({ bracketPublishedAt: null });
    const result = await new PublicTournamentRecordsService(prisma, access).getPlayerRecords('tour-1');
    expect(result).toEqual({ tournamentId: 'tour-1', goals: [], assists: [] });
    expect((prisma as unknown as { v1Game: { findMany: jest.Mock } }).v1Game.findMany).not.toHaveBeenCalled();
  });

  it('shows a withdrawn user as their displayName instead of the deleted_* internal nickname', async () => {
    const prisma = buildPrisma({
      games: [{ currentOfficialRevisionId: 'rev-1', visibilityPolicy: { mode: 'LIVE' } }],
      participantRows: [
        { participantId: 'p-a1', goals: 2, assists: 0, resultRevision: OFFICIAL },
      ],
      identityLinks: [{ participantId: 'p-a1', userId: 'user-a' }],
      userConsents: [{ userId: 'user-a', state: 'GRANTED' }],
      users: [
        { id: 'user-a', profile: { nickname: 'deleted_a1b2c3d4', displayName: '탈퇴 회원', deletedAt: new Date('2026-08-20T00:00:00Z') } },
      ],
    });
    const result = await new PublicTournamentRecordsService(prisma, access).getPlayerRecords('tour-1');
    expect(result.goals[0].nickname).toBe('탈퇴 회원');
  });

  it('drops zero-contribution rows before the consent lookup', async () => {
    const prisma = buildPrisma({
      games: [{ currentOfficialRevisionId: 'rev-1', visibilityPolicy: { mode: 'LIVE' } }],
      participantRows: [
        { participantId: 'p-zero', goals: 0, assists: 0, resultRevision: OFFICIAL },
        { participantId: 'p-scorer', goals: 1, assists: 0, resultRevision: OFFICIAL },
      ],
      identityLinks: [{ participantId: 'p-scorer', userId: 'user-a' }],
      userConsents: [{ userId: 'user-a', state: 'GRANTED' }],
      users: [{ id: 'user-a', profile: { nickname: 'a' } }],
    });
    await new PublicTournamentRecordsService(prisma, access).getPlayerRecords('tour-1');
    const linkQuery = (prisma as unknown as { v1ParticipantIdentityLinkCurrent: { findMany: jest.Mock } })
      .v1ParticipantIdentityLinkCurrent.findMany.mock.calls[0][0];
    expect(linkQuery.where.participantId.in).toEqual(['p-scorer']);
  });

  it('excludes hidden and status_only games from the ranking (lane visibility policy)', async () => {
    const prisma = buildPrisma({
      games: [
        { currentOfficialRevisionId: 'rev-live', visibilityPolicy: { mode: 'LIVE' } },
        { currentOfficialRevisionId: 'rev-hidden', visibilityPolicy: { mode: 'HIDDEN' } },
        { currentOfficialRevisionId: 'rev-status', visibilityPolicy: { mode: 'STATUS_ONLY' } },
        { currentOfficialRevisionId: 'rev-no-policy', visibilityPolicy: null },
      ],
      participantRows: [
        { participantId: 'p-a1', goals: 1, assists: 0, resultRevision: OFFICIAL },
      ],
      identityLinks: [{ participantId: 'p-a1', userId: 'user-a' }],
      userConsents: [{ userId: 'user-a', state: 'GRANTED' }],
      users: [{ id: 'user-a', profile: { nickname: 'a' } }],
    });
    await new PublicTournamentRecordsService(prisma, access).getPlayerRecords('tour-1');
    const query = (prisma as unknown as { v1GameResultParticipant: { findMany: jest.Mock } })
      .v1GameResultParticipant.findMany.mock.calls[0][0];
    // hidden·status_only·정책 없음(fail-closed)은 전부 제외 — LIVE 리비전만 남는다.
    expect(query.where.resultRevisionId.in).toEqual(['rev-live']);
  });

  it('skips rows whose revision has no officialAt', async () => {
    const prisma = buildPrisma({
      games: [{ currentOfficialRevisionId: 'rev-1', visibilityPolicy: { mode: 'LIVE' } }],
      participantRows: [
        { participantId: 'p-a1', goals: 3, assists: 0, resultRevision: { officialAt: null } },
      ],
      identityLinks: [{ participantId: 'p-a1', userId: 'user-a' }],
      userConsents: [{ userId: 'user-a', state: 'GRANTED' }],
      users: [{ id: 'user-a', profile: { nickname: 'a' } }],
    });
    const result = await new PublicTournamentRecordsService(prisma, access).getPlayerRecords('tour-1');
    expect(result.goals).toEqual([]);
  });
});
