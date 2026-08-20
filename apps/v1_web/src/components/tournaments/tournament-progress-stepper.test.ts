import { describe, expect, it } from 'vitest';
import { buildTournamentStages } from './tournament-progress-stepper';
import type { V1TournamentDetail, V1TournamentFixture } from '@/types/api';

/**
 * 이 테스트가 잡는 실제 버그(alpha 실측, 2026-08-20):
 * 대회 `이승민의 찐막`(format=group_knockout, status=completed)의 픽스처 `round` 는
 * `조별 1라운드` / `4강` / `결승` / `3·4위전` 이었다. 예전 구현은 `round === 'group'`
 * 처럼 **영문 키로만** 필터해서 세 필터가 전부 빈 배열이 됐고, 화면에는
 * `① 조별리그  ② 4강  ✓ 결승` — 즉 대회가 끝났는데 앞 두 단계가 "예정"으로 남았다.
 */
function fixture(over: Partial<V1TournamentFixture>): V1TournamentFixture {
  return {
    id: over.id ?? `f-${over.round ?? 'r'}-${over.fixtureNumber ?? 0}`,
    groupId: null,
    round: 'group',
    fixtureNumber: 1,
    legNumber: 1,
    scheduledAt: null,
    venue: null,
    status: 'scheduled',
    liveStatus: 'scheduled',
    homeRegistrationId: null,
    homeTeamId: null,
    homeTeamName: null,
    homeTeamLogoUrl: null,
    awayRegistrationId: null,
    awayTeamId: null,
    awayTeamName: null,
    awayTeamLogoUrl: null,
    result: null,
    videos: [],
    ...over,
  };
}

function tournament(over: {
  format: string;
  status: string;
  fixtures: V1TournamentFixture[];
}): V1TournamentDetail {
  return over as unknown as V1TournamentDetail;
}

/** 화면에 실제로 찍히는 것 = 라벨 + 상태. 그 쌍만 비교한다. */
function shape(stages: ReturnType<typeof buildTournamentStages>) {
  return stages.map((s) => [s.label, s.status]);
}

describe('buildTournamentStages — 한국어 라운드 라벨', () => {
  it('종료된 group_knockout 대회의 모든 단계가 완료로 표시된다 (alpha 이승민의 찐막 실데이터)', () => {
    const stages = buildTournamentStages(
      tournament({
        format: 'group_knockout',
        status: 'completed',
        fixtures: [
          fixture({ round: '조별 1라운드', fixtureNumber: 1, liveStatus: 'ended', status: 'completed' }),
          fixture({ round: '조별 1라운드', fixtureNumber: 2, liveStatus: 'ended', status: 'completed' }),
          fixture({ round: '4강', fixtureNumber: 3, liveStatus: 'ended', status: 'completed' }),
          fixture({ round: '4강', fixtureNumber: 4, liveStatus: 'ended', status: 'completed' }),
          fixture({ round: '결승', fixtureNumber: 5, liveStatus: 'ended', status: 'completed' }),
          fixture({ round: '3·4위전', fixtureNumber: 6, liveStatus: 'ended', status: 'completed' }),
        ],
      }),
    );

    expect(shape(stages)).toEqual([
      ['조별리그', 'done'],
      ['4강', 'done'],
      ['결승', 'done'],
    ]);
  });

  it('결승이 진행 중이면 앞 단계는 전부 완료로 접힌다', () => {
    const stages = buildTournamentStages(
      tournament({
        format: 'group_knockout',
        status: 'in_progress',
        fixtures: [
          fixture({ round: '조별 1라운드', fixtureNumber: 1, liveStatus: 'ended' }),
          fixture({ round: '4강', fixtureNumber: 2, liveStatus: 'ended' }),
          fixture({ round: '결승', fixtureNumber: 3, liveStatus: 'live' }),
        ],
      }),
    );

    expect(shape(stages)).toEqual([
      ['조별리그', 'done'],
      ['4강', 'done'],
      ['결승', 'active'],
    ]);
  });

  it('앞 단계에 취소된 경기가 남아 있어도 뒤 단계가 시작되면 완료로 접힌다', () => {
    const stages = buildTournamentStages(
      tournament({
        format: 'group_knockout',
        status: 'in_progress',
        fixtures: [
          fixture({ round: '조별 1라운드', fixtureNumber: 1, liveStatus: 'ended' }),
          fixture({ round: '조별 1라운드', fixtureNumber: 2, liveStatus: 'cancelled' }),
          fixture({ round: '4강', fixtureNumber: 3, liveStatus: 'live' }),
        ],
      }),
    );

    expect(shape(stages)).toEqual([
      ['조별리그', 'done'],
      ['4강', 'active'],
    ]);
  });

  it('3·4위전은 결승 다음 단계로 끼어들지 않는다', () => {
    const stages = buildTournamentStages(
      tournament({
        format: 'group_knockout',
        status: 'in_progress',
        fixtures: [
          fixture({ round: '조별 1라운드', fixtureNumber: 1, liveStatus: 'ended' }),
          fixture({ round: '결승', fixtureNumber: 2, liveStatus: 'scheduled' }),
          fixture({ round: '3위 결정전', fixtureNumber: 3, liveStatus: 'scheduled' }),
        ],
      }),
    );

    expect(shape(stages).map(([label]) => label)).toEqual(['조별리그', '결승']);
  });

  it('영문 키(QA 시드 어휘)도 그대로 한국어 라벨로 세운다', () => {
    const stages = buildTournamentStages(
      tournament({
        format: 'group_knockout',
        status: 'in_progress',
        fixtures: [
          fixture({ round: 'group', fixtureNumber: 1, liveStatus: 'ended' }),
          fixture({ round: 'semi', fixtureNumber: 2, liveStatus: 'ended' }),
          fixture({ round: 'final', fixtureNumber: 3, liveStatus: 'scheduled' }),
          fixture({ round: 'third_place', fixtureNumber: 4, liveStatus: 'scheduled' }),
        ],
      }),
    );

    expect(shape(stages)).toEqual([
      ['조별리그', 'done'],
      ['4강', 'done'],
      ['결승', 'upcoming'],
    ]);
  });

  it('결선 단계는 서버 배열 순서가 아니라 fixtureNumber 순서로 세운다', () => {
    const stages = buildTournamentStages(
      tournament({
        format: 'knockout',
        status: 'in_progress',
        // 서버는 결승을 4강보다 먼저 담아 보낼 수 있다(alpha 실측).
        fixtures: [
          fixture({ round: '결승', fixtureNumber: 5, liveStatus: 'scheduled' }),
          fixture({ round: '4강', fixtureNumber: 3, liveStatus: 'ended' }),
          fixture({ round: '8강', fixtureNumber: 1, liveStatus: 'ended' }),
        ],
      }),
    );

    expect(shape(stages).map(([label]) => label)).toEqual(['8강', '4강', '결승']);
  });

  it('knockout 포맷에는 조별리그 단계를 만들지 않는다', () => {
    const stages = buildTournamentStages(
      tournament({
        format: 'knockout',
        status: 'in_progress',
        fixtures: [fixture({ round: '4강', fixtureNumber: 1, liveStatus: 'live' })],
      }),
    );

    expect(shape(stages)).toEqual([['4강', 'active']]);
  });
});
