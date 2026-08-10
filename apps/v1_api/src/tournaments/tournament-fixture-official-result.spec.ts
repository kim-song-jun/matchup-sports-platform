/**
 * tournament-fixture-official-result.spec.ts
 *
 * R3 §4-3~§4-4단계 사이 한시적 레거시 폴백의 단일 소스(tournament-fixture-official-result.ts)를
 * 직접 검증한다. 순수 함수라 mock 없이 실제 입력/출력만으로 계약을 증명한다.
 *
 * 핵심 두 가지(작업 지시서 그대로):
 *   1. 새 경로에 OFFICIAL 리비전이 없고 레거시 결과만 있을 때 → 레거시로 점수/골/타임스탬프가 나온다.
 *   2. 새 경로와 레거시가 둘 다 있을 때 → 새 경로가 이긴다(레거시는 무시된다).
 * 그 외 hasTournamentFixtureOfficialResult() 가드 판정도 동일 기준으로 함께 검증한다.
 */
import type { Prisma } from '@prisma/client';
import {
  hasTournamentFixtureOfficialResult,
  parseTournamentFixtureOfficialScore,
  resolveTournamentFixtureOfficialResult,
  resolveTournamentFixtureOfficialScore,
  resolveTournamentFixtureOfficialTimestamp,
  type TournamentFixtureGameForResult,
  type TournamentFixtureLegacyResult,
} from './tournament-fixture-official-result';

function officialGame(overrides: Record<string, unknown> = {}): TournamentFixtureGameForResult {
  return {
    sides: [
      { id: 'side-home', sideKey: 'HOME' },
      { id: 'side-away', sideKey: 'AWAY' },
    ],
    participants: [{ id: 'player-1', displayNameSnapshot: '새경로 선수' }],
    events: [
      { id: 'event-1', type: 'GOAL', sideId: 'side-home', participantId: 'player-1', clockMs: 60000, reversesEventId: null },
    ],
    currentOfficialRevision: {
      id: 'revision-new-path',
      state: 'OFFICIAL',
      score: { home: 2, away: 1 } satisfies Prisma.JsonObject,
      officialAt: new Date('2026-08-01T00:00:00.000Z'),
      createdAt: new Date('2026-08-01T00:00:00.000Z'),
      updatedAt: new Date('2026-08-01T00:00:00.000Z'),
    },
    ...overrides,
  } as TournamentFixtureGameForResult;
}

function legacyResult(overrides: Record<string, unknown> = {}): TournamentFixtureLegacyResult {
  return {
    id: 'legacy-result-1',
    fixtureId: 'fixture-1',
    homeScore: 3,
    awayScore: 0,
    hasPenalty: false,
    homePenaltyScore: null,
    awayPenaltyScore: null,
    note: '레거시 메모',
    recordedByAdminUserId: null,
    recordedAt: new Date('2026-07-01T00:00:00.000Z'),
    createdAt: new Date('2026-07-01T00:00:00.000Z'),
    updatedAt: new Date('2026-07-01T00:00:00.000Z'),
    goals: [
      {
        id: 'legacy-goal-1',
        fixtureResultId: 'legacy-result-1',
        team: 'home',
        playerId: null,
        playerName: '레거시 득점자',
        minute: 10,
        createdAt: new Date('2026-07-01T00:00:00.000Z'),
      },
    ],
    ...overrides,
  } as TournamentFixtureLegacyResult;
}

describe('resolveTournamentFixtureOfficialScore', () => {
  it('game 자체가 없고(백필 전) 레거시만 있을 때 → 레거시 스코어로 폴백한다', () => {
    const score = resolveTournamentFixtureOfficialScore(null, {
      homeScore: 3,
      awayScore: 0,
      hasPenalty: false,
      homePenaltyScore: null,
      awayPenaltyScore: null,
    });
    expect(score).toEqual({ homeScore: 3, awayScore: 0, hasPenalty: false, homePenaltyScore: null, awayPenaltyScore: null });
  });

  it('OFFICIAL 리비전과 레거시가 둘 다 있으면 새 경로 스코어가 이긴다', () => {
    const score = resolveTournamentFixtureOfficialScore(
      { currentOfficialRevision: { state: 'OFFICIAL', score: { home: 2, away: 1 } } },
      { homeScore: 3, awayScore: 0, hasPenalty: false, homePenaltyScore: null, awayPenaltyScore: null },
    );
    expect(score).toEqual({ homeScore: 2, awayScore: 1, hasPenalty: false, homePenaltyScore: null, awayPenaltyScore: null });
  });

  it('VOID로 넘어간 리비전은 OFFICIAL이 아니므로 레거시로 폴백한다', () => {
    const score = resolveTournamentFixtureOfficialScore(
      { currentOfficialRevision: { state: 'VOID', score: { home: 2, away: 1 } } },
      { homeScore: 3, awayScore: 0, hasPenalty: false, homePenaltyScore: null, awayPenaltyScore: null },
    );
    expect(score).toEqual({ homeScore: 3, awayScore: 0, hasPenalty: false, homePenaltyScore: null, awayPenaltyScore: null });
  });

  it('둘 다 없으면 null', () => {
    expect(resolveTournamentFixtureOfficialScore(null, null)).toBeNull();
    expect(resolveTournamentFixtureOfficialScore(null, undefined)).toBeNull();
  });
});

describe('parseTournamentFixtureOfficialScore (승부차기)', () => {
  it('평평한 {home,away} 형태에 penalties가 없으면 hasPenalty:false로 남는다(회귀 방지)', () => {
    expect(parseTournamentFixtureOfficialScore({ home: 1, away: 0 })).toEqual({
      homeScore: 1,
      awayScore: 0,
      hasPenalty: false,
      homePenaltyScore: null,
      awayPenaltyScore: null,
    });
  });

  it('평평한 {home,away,penalties} 형태(GamesService.deriveTournamentRevision/교정 산출물) → hasPenalty가 표면화된다', () => {
    expect(parseTournamentFixtureOfficialScore({ home: 1, away: 1, penalties: { home: 5, away: 4 } })).toEqual({
      homeScore: 1,
      awayScore: 1,
      hasPenalty: true,
      homePenaltyScore: 5,
      awayPenaltyScore: 4,
    });
  });

  it('중첩 GAME_BACKFILL 형태의 penalty는 기존대로 계속 동작한다(회귀 방지)', () => {
    expect(
      parseTournamentFixtureOfficialScore({
        regulation: { home: 1, away: 1 },
        penalty: { home: 5, away: 4 },
        goals: [],
        incomplete: false,
        provenance: 'GAME_BACKFILL',
      }),
    ).toEqual({ homeScore: 1, awayScore: 1, hasPenalty: true, homePenaltyScore: 5, awayPenaltyScore: 4 });
  });

  it('penalties가 구조를 갖추지 못하면(home/away 아님) hasPenalty:false로 무시한다', () => {
    expect(parseTournamentFixtureOfficialScore({ home: 1, away: 1, penalties: { home: 5 } })).toEqual({
      homeScore: 1,
      awayScore: 1,
      hasPenalty: false,
      homePenaltyScore: null,
      awayPenaltyScore: null,
    });
  });
});

describe('resolveTournamentFixtureOfficialResult', () => {
  it('새 경로에 OFFICIAL 리비전이 없고 레거시 결과만 있을 때 → 레거시 스코어/골/note/타임스탬프로 조립한다', () => {
    const resolved = resolveTournamentFixtureOfficialResult(null, legacyResult());
    expect(resolved).toEqual({
      revisionId: 'legacy-result-1',
      score: { homeScore: 3, awayScore: 0, hasPenalty: false, homePenaltyScore: null, awayPenaltyScore: null },
      note: '레거시 메모',
      officialAt: new Date('2026-07-01T00:00:00.000Z'),
      createdAt: new Date('2026-07-01T00:00:00.000Z'),
      updatedAt: new Date('2026-07-01T00:00:00.000Z'),
      goals: [
        { id: 'legacy-goal-1', team: 'home', playerId: null, playerName: '레거시 득점자', minute: 10 },
      ],
    });
  });

  it('새 경로 OFFICIAL 리비전과 레거시 결과가 둘 다 있으면 새 경로가 이긴다(레거시는 무시)', () => {
    const resolved = resolveTournamentFixtureOfficialResult(officialGame(), legacyResult());
    expect(resolved).toMatchObject({
      revisionId: 'revision-new-path',
      score: { homeScore: 2, awayScore: 1 },
      note: null,
    });
    expect(resolved?.goals).toEqual([
      { id: 'event-1', team: 'home', playerId: 'player-1', playerName: '새경로 선수', minute: 1 },
    ]);
  });

  it('레거시 결과도 game도 없으면 null', () => {
    expect(resolveTournamentFixtureOfficialResult(null, null)).toBeNull();
    expect(resolveTournamentFixtureOfficialResult(null, undefined)).toBeNull();
  });

  it('OFFICIAL 리비전은 있지만 score가 파싱 불가하면 레거시로 덮어쓰지 않고 null(조용한 데이터 오염 방지)', () => {
    const resolved = resolveTournamentFixtureOfficialResult(
      officialGame({
        currentOfficialRevision: {
          id: 'revision-new-path',
          state: 'OFFICIAL',
          score: { garbage: true } satisfies Prisma.JsonObject,
          officialAt: new Date('2026-08-01T00:00:00.000Z'),
          createdAt: new Date('2026-08-01T00:00:00.000Z'),
          updatedAt: new Date('2026-08-01T00:00:00.000Z'),
        },
      }),
      legacyResult(),
    );
    expect(resolved).toBeNull();
  });
});

describe('hasTournamentFixtureOfficialResult', () => {
  it('game 없음 + 레거시 결과 있음 → true(폴백 반영)', () => {
    expect(hasTournamentFixtureOfficialResult(null, { id: 'legacy-result-1' })).toBe(true);
  });

  it('game 없음 + 레거시 결과도 없음 → false', () => {
    expect(hasTournamentFixtureOfficialResult(null, null)).toBe(false);
    expect(hasTournamentFixtureOfficialResult(undefined, undefined)).toBe(false);
  });

  it('새 경로 OFFICIAL 리비전이 있으면 레거시 유무와 무관하게 true', () => {
    expect(hasTournamentFixtureOfficialResult({ currentOfficialRevision: { state: 'OFFICIAL' } }, null)).toBe(true);
  });

  it('VOID 리비전만 있고 레거시가 없으면 false(레거시 결과만 있는 픽스처의 팀 변경 가드와 동일 기준)', () => {
    expect(hasTournamentFixtureOfficialResult({ currentOfficialRevision: { state: 'VOID' } }, null)).toBe(false);
  });
});

describe('resolveTournamentFixtureOfficialTimestamp', () => {
  it('game 없음 + 레거시 recordedAt 있음 → 레거시 타임스탬프로 폴백(리뷰 게이트가 이 값을 그대로 쓴다)', () => {
    const recordedAt = new Date('2026-07-01T00:00:00.000Z');
    expect(resolveTournamentFixtureOfficialTimestamp(null, recordedAt)).toEqual(recordedAt);
  });

  it('새 경로 OFFICIAL 리비전이 있으면 officialAt이 이기고 레거시는 무시된다', () => {
    const officialAt = new Date('2026-08-01T00:00:00.000Z');
    const legacyRecordedAt = new Date('2026-07-01T00:00:00.000Z');
    expect(
      resolveTournamentFixtureOfficialTimestamp({ currentOfficialRevision: { state: 'OFFICIAL', officialAt } }, legacyRecordedAt),
    ).toEqual(officialAt);
  });

  it('둘 다 없으면 null(완료 처리 안 된 경기)', () => {
    expect(resolveTournamentFixtureOfficialTimestamp(null, null)).toBeNull();
    expect(resolveTournamentFixtureOfficialTimestamp(null, undefined)).toBeNull();
  });
});
