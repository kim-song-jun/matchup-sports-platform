/**
 * tournament-group-standings.spec.ts
 *
 * 승부차기 트랙 B의 마지막 요구사항: "승부차기가 조별 순위의 승/무/패를 바꾸지 않는다".
 * `standingsFixturesFromGroup()`이 실제로 `resolveTournamentFixtureOfficialScore()`가
 * 돌려주는 `TournamentFixtureOfficialScore`에서 `homeScore`/`awayScore`만 뽑아 쓰고
 * `hasPenalty`/`homePenaltyScore`/`awayPenaltyScore`는 아예 읽지 않는다는 사실을 실제
 * 함수 호출로 증명한다(필드 존재만 확인하는 것이 아니라, 승부차기로 결정된 무승부 픽스처를
 * 넣었을 때 결과 StandingFixture가 정규시간 스코어 그대로인지 검증).
 */
import type { Prisma } from '@prisma/client';
import {
  fairPlayByRegistrationFromGroups,
  recalculateAndUpsertGroupStandings,
  standingsFixturesFromGroup,
  type StandingsSourceGroup,
} from './tournament-group-standings';
import { FOOTBALL_V1_CONFIG } from './competition-config/competition-config';

describe('standingsFixturesFromGroup (승부차기는 조별 순위에 영향을 주지 않는다)', () => {
  it('정규시간 무승부 + 승부차기 기록이 있어도 StandingFixture는 정규시간 스코어(무승부) 그대로다', () => {
    const group: StandingsSourceGroup = {
      id: 'group-1',
      groupTeams: [{ registrationId: 'reg-home' }, { registrationId: 'reg-away' }],
      fixtures: [
        {
          homeRegistrationId: 'reg-home',
          awayRegistrationId: 'reg-away',
          game: {
            // Flat producer shape written by GamesService.applyPenalties for
            // a knockout draw resolved by a shootout -- see
            // tournament-fixture-official-result.ts's file doc.
            currentOfficialRevision: {
              state: 'OFFICIAL',
              score: { home: 1, away: 1, penalties: { home: 5, away: 4 } },
            },
          },
        },
      ],
    };

    const fixtures = standingsFixturesFromGroup(group);

    expect(fixtures).toEqual([
      {
        homeRegistrationId: 'reg-home',
        awayRegistrationId: 'reg-away',
        homeScore: 1,
        awayScore: 1,
      },
    ]);
  });
});

/**
 * F5: 페어플레이 벌점이 카드 기록에서 실제로 연결되는지.
 *
 * PR 본문은 "페어플레이 벌점을 tie-break 5단계에 연결했다"고 적었지만
 * `fairPlayByRegistration`을 실제로 카드에서 집계해 넘기는 호출부가 0건이라
 * 운영에서는 모든 팀이 항상 0점이었다(5단계 tie-break가 죽어 있었다). 이 스펙은
 * `V1GameResultParticipant.cards`(Json, 실제 구조 `{yellow, red}` — games.service.ts의
 * CARD 이벤트 집계 확인) → `fairPlayByRegistrationFromGroups()`가 0이 아닌 값을
 * 실제로 뽑아내는지 증명한다.
 */
describe('fairPlayByRegistrationFromGroups (F5: 페어플레이 실제 연결)', () => {
  function officialGroup(overrides: {
    // cards 는 Prisma 의 Json 컬럼이라 JsonValue 여야 한다. unknown 으로 두면
    // StandingsSourceGroup 에 대입할 때 TS2322 로 막힌다(로컬에서 ts-jest diagnostics 를
    // 끄고 돌리면 통과하지만 CI 의 tsc --noEmit 이 잡는다).
    resultParticipants: Array<{ sideId: string; cards: Prisma.JsonValue }>;
    sides?: Array<{ id: string; sideKey: string }>;
  }): StandingsSourceGroup {
    return {
      id: 'group-1',
      groupTeams: [{ registrationId: 'reg-home' }, { registrationId: 'reg-away' }],
      fixtures: [
        {
          homeRegistrationId: 'reg-home',
          awayRegistrationId: 'reg-away',
          game: {
            currentOfficialRevision: {
              state: 'OFFICIAL',
              score: { home: 2, away: 1 },
              resultParticipants: overrides.resultParticipants,
            },
            sides: overrides.sides ?? [
              { id: 'side-home', sideKey: 'HOME' },
              { id: 'side-away', sideKey: 'AWAY' },
            ],
          },
        },
      ],
    };
  }

  it('홈팀 옐로 카드 1장은 홈 registrationId에 1점으로 집계된다', () => {
    const group = officialGroup({
      resultParticipants: [{ sideId: 'side-home', cards: { yellow: 1, red: 0 } }],
    });

    const totals = fairPlayByRegistrationFromGroups([group]);

    expect(totals.get('reg-home')).toBe(1);
    expect(totals.has('reg-away')).toBe(false);
  });

  it('원정팀 직접 퇴장(red)은 원정 registrationId에 4점으로 집계된다', () => {
    const group = officialGroup({
      resultParticipants: [{ sideId: 'side-away', cards: { yellow: 0, red: 1 } }],
    });

    const totals = fairPlayByRegistrationFromGroups([group]);

    expect(totals.get('reg-away')).toBe(4);
  });

  it('같은 팀 여러 참가자의 카드는 registrationId 기준으로 합산된다', () => {
    const group = officialGroup({
      resultParticipants: [
        { sideId: 'side-home', cards: { yellow: 1, red: 0 } },
        { sideId: 'side-home', cards: { yellow: 2, red: 1 } },
      ],
    });

    const totals = fairPlayByRegistrationFromGroups([group]);

    // 1 + (2*1 + 1*4) = 1 + 6 = 7
    expect(totals.get('reg-home')).toBe(7);
  });

  it('레거시 폴백 픽스처(OFFICIAL 리비전 없음)는 카드 데이터가 없어 건너뛴다', () => {
    const group: StandingsSourceGroup = {
      id: 'group-1',
      groupTeams: [{ registrationId: 'reg-home' }, { registrationId: 'reg-away' }],
      fixtures: [
        {
          homeRegistrationId: 'reg-home',
          awayRegistrationId: 'reg-away',
          game: null,
          result: { homeScore: 2, awayScore: 1, hasPenalty: false, homePenaltyScore: null, awayPenaltyScore: null },
        },
      ],
    };

    const totals = fairPlayByRegistrationFromGroups([group]);

    expect(totals.size).toBe(0);
  });

  it('여러 조를 넘겨도 조별 합계가 registrationId 기준으로 올바르게 합쳐진다', () => {
    const groupA = officialGroup({
      resultParticipants: [{ sideId: 'side-home', cards: { yellow: 1, red: 0 } }],
    });
    const groupB: StandingsSourceGroup = {
      id: 'group-2',
      groupTeams: [{ registrationId: 'reg-3' }, { registrationId: 'reg-4' }],
      fixtures: [
        {
          homeRegistrationId: 'reg-3',
          awayRegistrationId: 'reg-4',
          game: {
            currentOfficialRevision: {
              state: 'OFFICIAL',
              score: { home: 0, away: 0 },
              resultParticipants: [{ sideId: 'side-3', cards: { yellow: 2, red: 0 } }],
            },
            sides: [
              { id: 'side-3', sideKey: 'HOME' },
              { id: 'side-4', sideKey: 'AWAY' },
            ],
          },
        },
      ],
    };

    const totals = fairPlayByRegistrationFromGroups([groupA, groupB]);

    expect(totals.get('reg-home')).toBe(1);
    expect(totals.get('reg-3')).toBe(2);
  });
});

describe('recalculateAndUpsertGroupStandings (F5: fairPlayPoints가 실제로 upsert된다)', () => {
  function makeTx() {
    return {
      v1TournamentStanding: { upsert: jest.fn().mockResolvedValue({}) },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
  }

  it('fairPlayByRegistration을 넘기면 create/update 양쪽 payload에 fairPlayPoints가 반영된다', async () => {
    const tx = makeTx();
    const group: StandingsSourceGroup = {
      id: 'group-1',
      groupTeams: [{ registrationId: 'reg-home' }, { registrationId: 'reg-away' }],
      fixtures: [
        {
          homeRegistrationId: 'reg-home',
          awayRegistrationId: 'reg-away',
          game: { currentOfficialRevision: { state: 'OFFICIAL', score: { home: 1, away: 1 } } },
        },
      ],
    };

    await recalculateAndUpsertGroupStandings(
      tx,
      {
        tournamentId: 't-1',
        configVersionId: 'cfg-1',
        config: FOOTBALL_V1_CONFIG,
        group,
        fairPlayByRegistration: new Map([
          ['reg-home', 1],
          ['reg-away', 7],
        ]),
      },
      new Date('2026-08-17T00:00:00Z'),
    );

    const calls = (tx.v1TournamentStanding.upsert as jest.Mock).mock.calls;
    const homeCall = calls.find((c) => c[0].create.registrationId === 'reg-home')?.[0];
    const awayCall = calls.find((c) => c[0].create.registrationId === 'reg-away')?.[0];
    expect(homeCall.create.fairPlayPoints).toBe(1);
    expect(homeCall.update.fairPlayPoints).toBe(1);
    expect(awayCall.create.fairPlayPoints).toBe(7);
    expect(awayCall.update.fairPlayPoints).toBe(7);
  });
});
