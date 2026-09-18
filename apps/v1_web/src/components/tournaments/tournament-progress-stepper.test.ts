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
  /** 생략하면 단발 대회 — 기존 케이스의 동작을 그대로 유지한다. */
  kind?: 'regular_tournament' | 'regular_league' | null;
}): V1TournamentDetail {
  return { kind: 'regular_tournament', ...over } as unknown as V1TournamentDetail;
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

    // 결승 칸은 픽스처가 없어도 항상 마지막에 선다(아래 전용 테스트 참고).
    expect(shape(stages)).toEqual([
      ['조별리그', 'done'],
      ['4강', 'active'],
      ['결승', 'upcoming'],
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

  it('결승 픽스처가 아직 없어도 결승 칸을 세운다 (alpha 실측: 라운드가 조별·4강뿐인 진행 중 대회)', () => {
    const stages = buildTournamentStages(
      tournament({
        format: 'group_knockout',
        status: 'in_progress',
        fixtures: [
          fixture({ round: '조별 리그', fixtureNumber: 1, liveStatus: 'ended' }),
          fixture({ round: '4강', fixtureNumber: 2, liveStatus: 'scheduled' }),
        ],
      }),
    );

    expect(shape(stages)).toEqual([
      ['조별리그', 'done'],
      ['4강', 'upcoming'],
      ['결승', 'upcoming'],
    ]);
  });

  it('결승 픽스처가 이미 있으면 결승 칸을 두 번 세우지 않는다', () => {
    const stages = buildTournamentStages(
      tournament({
        format: 'group_knockout',
        status: 'in_progress',
        fixtures: [
          fixture({ round: '조별 리그', fixtureNumber: 1, liveStatus: 'ended' }),
          fixture({ round: '4강', fixtureNumber: 2, liveStatus: 'ended' }),
          fixture({ round: '결승', fixtureNumber: 3, liveStatus: 'live' }),
        ],
      }),
    );

    expect(shape(stages).map(([label]) => label)).toEqual(['조별리그', '4강', '결승']);
  });

  it('대진이 하나도 없는 조별+토너먼트도 출발점과 목적지는 보여준다', () => {
    const stages = buildTournamentStages(
      tournament({ format: 'group_knockout', status: 'in_progress', fixtures: [] }),
    );

    expect(shape(stages)).toEqual([
      ['조별리그', 'upcoming'],
      ['결승', 'upcoming'],
    ]);
  });

  it('준결승은 결승으로 오인되지 않는다 — 결승 칸이 따로 선다', () => {
    const stages = buildTournamentStages(
      tournament({
        format: 'knockout',
        status: 'in_progress',
        fixtures: [fixture({ round: '준결승', fixtureNumber: 1, liveStatus: 'live' })],
      }),
    );

    expect(shape(stages)).toEqual([
      ['준결승', 'active'],
      ['결승', 'upcoming'],
    ]);
  });

  it('knockout 포맷에는 조별리그 단계를 만들지 않는다', () => {
    const stages = buildTournamentStages(
      tournament({
        format: 'knockout',
        status: 'in_progress',
        fixtures: [fixture({ round: '4강', fixtureNumber: 1, liveStatus: 'live' })],
      }),
    );

    // 논점은 "조별리그가 없다" — 결승은 목적지라 이 포맷에도 항상 선다.
    expect(shape(stages).map(([label]) => label)).not.toContain('조별리그');
    expect(shape(stages)).toEqual([
      ['4강', 'active'],
      ['결승', 'upcoming'],
    ]);
  });
});


/**
 * 통합 거울 행(정규 리그 시즌)이 이 단계 표시기를 탈 때.
 *
 * **픽스처가 `format: 'group_knockout'` 인 것이 핵심이다.** 백필과 dual-write 가 `format` 을
 * 안 채워서 스키마 기본값이 그대로 남는 것이 거울 행의 실제 모양이고, `format` 만 보면
 * 리그 참가자가 "조별리그 → 4강 → 결승" 단계를 보게 된다.
 *
 * `format: 'league'` 로 픽스처를 만들면 `||` 앞쪽이 참이라 `kind` 를 안 타서, `|| kind` 를
 * 지워도 통과하는 vacuous 테스트가 된다.
 */
describe('buildTournamentStages — 정규 리그 거울 행', () => {
  it('format 이 group_knockout 이어도 kind=regular_league 면 리그 단계를 그린다', () => {
    const stages = buildTournamentStages(
      tournament({
        format: 'group_knockout',
        kind: 'regular_league',
        status: 'in_progress',
        fixtures: [
          fixture({ round: '1라운드', fixtureNumber: 1, liveStatus: 'ended', status: 'completed' }),
          fixture({ round: '2라운드', fixtureNumber: 2, liveStatus: 'scheduled' }),
        ],
      }),
    );

    // 리그는 두 칸(리그 방식 · 시상)이다. 조별/4강/결승 칸이 하나라도 있으면 틀렸다.
    expect(shape(stages)).toEqual([
      ['리그 방식', 'active'],
      ['시상', 'upcoming'],
    ]);
  });

  it('같은 format 이라도 kind 가 단발 대회면 조별+결선 단계를 그린다 — 회귀 가드', () => {
    const stages = buildTournamentStages(
      tournament({
        format: 'group_knockout',
        kind: 'regular_tournament',
        status: 'in_progress',
        fixtures: [
          fixture({ round: '조별 1라운드', fixtureNumber: 1, liveStatus: 'ended', status: 'completed' }),
        ],
      }),
    );

    expect(stages.map((s) => s.label)).not.toContain('리그 방식');
    expect(stages.map((s) => s.label)).toContain('조별리그');
  });
});
