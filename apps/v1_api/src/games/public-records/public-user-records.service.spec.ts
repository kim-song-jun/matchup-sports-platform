import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PublicUserRecordsService } from './public-user-records.service';

const OWNER_ID = 'user-owner';

/**
 * `loadParticipantConsentEligibility`(public-consent.ts)가 내부적으로
 * `v1ParticipantIdentityLinkCurrent.findMany`을 `where.userId` 아닌
 * `where.participantId`로 다시 호출한다 -- 그래서 이 mock은 두 형태를 args로 구분한다
 * (loadEligibleRows 자신의 `where: { userId }` 조회와 겹치지 않게).
 */
function createFakePrisma(config: {
  links: ReadonlyArray<{ participantId: string; linkId: string; userId: string }>;
  userConsents: ReadonlyArray<{ userId: string; state: 'GRANTED' | 'REVOKED' }>;
  snapshots: ReadonlyArray<{ linkId: string; state: 'GRANTED' | 'REVOKED' }>;
  resultRows: unknown[];
  viewerConsentState?: 'GRANTED' | 'REVOKED' | null;
}) {
  const linkFindMany = jest.fn().mockImplementation((args: { where: Record<string, unknown> }) => {
    if ('userId' in args.where) {
      return Promise.resolve(
        config.links.filter((link) => link.userId === args.where.userId).map((link) => ({ participantId: link.participantId })),
      );
    }
    return Promise.resolve(config.links.map((link) => ({ participantId: link.participantId, linkId: link.linkId, userId: link.userId })));
  });

  return {
    v1User: {
      findUnique: jest.fn().mockResolvedValue({ id: OWNER_ID, profile: { nickname: '테스트유저' } }),
    },
    v1UserRecordConsent: {
      findMany: jest.fn().mockResolvedValue(config.userConsents),
      findUnique: jest.fn().mockResolvedValue(
        config.viewerConsentState === undefined
          ? null
          : config.viewerConsentState === null
            ? null
            : { state: config.viewerConsentState },
      ),
    },
    v1ParticipantIdentityLinkCurrent: { findMany: linkFindMany },
    v1ParticipantConsentSnapshot: { findMany: jest.fn().mockResolvedValue(config.snapshots) },
    v1GameResultParticipant: { findMany: jest.fn().mockResolvedValue(config.resultRows) },
    v1GameSide: {
      findMany: jest.fn().mockResolvedValue([
        { id: 'side-1', gameId: 'game-1', sideKey: 'HOME', teamId: null, displayNameSnapshot: '우리팀' },
      ]),
    },
    v1TournamentFixture: { findMany: jest.fn().mockResolvedValue([]) },
    v1Team: { findMany: jest.fn().mockResolvedValue([]) },
    v1Tournament: { findMany: jest.fn().mockResolvedValue([]) },
  } as unknown as PrismaService;
}

function gameResultRow() {
  return {
    id: 'result-1',
    resultRevisionId: 'revision-1',
    participantId: 'participant-1',
    sideId: 'side-1',
    started: true,
    minutesPlayed: 90,
    goals: 1,
    assists: 0,
    cards: { yellow: 0, red: 0 },
    goalkeeper: false,
    resultRevision: {
      id: 'revision-1',
      gameId: 'game-1',
      officialAt: new Date('2026-08-10T00:00:00Z'),
      mvpParticipantId: null,
      score: { home: 1, away: 0 },
      game: { sourceType: 'TEAM_MATCH', tournamentFixtureId: null, currentOfficialRevisionId: 'revision-1' },
    },
  };
}

describe('PublicUserRecordsService', () => {
  it('존재하지 않는 사용자는 404를 던진다', async () => {
    const prisma = createFakePrisma({ links: [], userConsents: [], snapshots: [], resultRows: [] });
    (prisma.v1User.findUnique as jest.Mock).mockResolvedValue(null);
    const service = new PublicUserRecordsService(prisma);

    await expect(service.getRecords('missing-user', {})).rejects.toBeInstanceOf(NotFoundException);
  });

  it('본인 조회는 사용자 단위 동의(GRANTED)가 없어도 신원 연결된 자신의 기록을 볼 수 있다', async () => {
    const prisma = createFakePrisma({
      links: [{ participantId: 'participant-1', linkId: 'link-1', userId: OWNER_ID }],
      userConsents: [], // 동의 행 자체가 없음 -- REVOKED도 아니고 그냥 "응답한 적 없음"
      snapshots: [], // participant 단위 개별 숨김 없음
      resultRows: [gameResultRow()],
      viewerConsentState: null,
    });
    const service = new PublicUserRecordsService(prisma);

    const result = await service.getRecords(OWNER_ID, {}, OWNER_ID);

    expect(result.viewerIsOwner).toBe(true);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).not.toHaveProperty('isCorrected');
    // 본인 조회이므로 consentGranted가 최상위에 채워진다 -- 동의 행이 없으므로 false.
    expect(result.consentGranted).toBe(false);
  });

  it('본인이어도 participant 단위로 REVOKED 스냅샷을 건 기록은 여전히 숨는다', async () => {
    const prisma = createFakePrisma({
      links: [{ participantId: 'participant-1', linkId: 'link-1', userId: OWNER_ID }],
      userConsents: [{ userId: OWNER_ID, state: 'GRANTED' }], // 사용자 단위 동의는 켜져 있어도
      snapshots: [{ linkId: 'link-1', state: 'REVOKED' }], // 이 참가 기록 하나만 명시적으로 숨김
      resultRows: [gameResultRow()],
      viewerConsentState: 'GRANTED',
    });
    const service = new PublicUserRecordsService(prisma);

    const result = await service.getRecords(OWNER_ID, {}, OWNER_ID);

    expect(result.viewerIsOwner).toBe(true);
    expect(result.items).toHaveLength(0);
    expect(result.consentGranted).toBe(true);
  });

  it('타인이 조회하면 사용자 단위 동의가 없는 한 항상 숨고, 응답에 consentGranted가 실리지 않는다', async () => {
    const prisma = createFakePrisma({
      links: [{ participantId: 'participant-1', linkId: 'link-1', userId: OWNER_ID }],
      userConsents: [], // 동의 없음
      snapshots: [],
      resultRows: [gameResultRow()],
    });
    const service = new PublicUserRecordsService(prisma);

    const result = await service.getRecords(OWNER_ID, {}, 'someone-else');

    expect(result.viewerIsOwner).toBe(false);
    expect(result.items).toHaveLength(0);
    expect('consentGranted' in result).toBe(false);
  });

  it('비로그인 방문자(viewerId undefined)도 타인 취급되어 동의 없는 기록은 숨는다', async () => {
    const prisma = createFakePrisma({
      links: [{ participantId: 'participant-1', linkId: 'link-1', userId: OWNER_ID }],
      userConsents: [],
      snapshots: [],
      resultRows: [gameResultRow()],
    });
    const service = new PublicUserRecordsService(prisma);

    const result = await service.getRecords(OWNER_ID, {}, undefined);

    expect(result.viewerIsOwner).toBe(false);
    expect(result.items).toHaveLength(0);
    expect('consentGranted' in result).toBe(false);
  });

  it('타인이 조회할 때 사용자 단위 동의가 GRANTED고 개별 숨김도 없으면 기록이 보인다', async () => {
    const prisma = createFakePrisma({
      links: [{ participantId: 'participant-1', linkId: 'link-1', userId: OWNER_ID }],
      userConsents: [{ userId: OWNER_ID, state: 'GRANTED' }],
      snapshots: [],
      resultRows: [gameResultRow()],
    });
    const service = new PublicUserRecordsService(prisma);

    const result = await service.getRecords(OWNER_ID, {}, 'someone-else');

    expect(result.viewerIsOwner).toBe(false);
    expect(result.items).toHaveLength(1);
    expect('consentGranted' in result).toBe(false);
  });
});
