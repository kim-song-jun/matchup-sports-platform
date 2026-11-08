import { describe, expect, it } from 'vitest';
import { buildTournamentStages, pickFocusStageIndex } from './tournament-progress-stepper';
import type { V1TournamentDetail, V1TournamentFixture, V1TournamentGroup } from '@/types/api';

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
    homeSlotLabel: null,
    awaySlotLabel: null,
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
  groups?: V1TournamentGroup[];
}): V1TournamentDetail {
  return { kind: 'regular_tournament', ...over } as unknown as V1TournamentDetail;
}

/** 화면에 실제로 찍히는 것 = 라벨 + 상태. 그 쌍만 비교한다. */
function shape(stages: ReturnType<typeof buildTournamentStages>) {
  return stages.map((s) => [s.label, s.status]);
}

describe('buildTournamentStages — 한국어 라운드 라벨', () => {
  it.each([
    ['group', 'semi', 'quarter', 'round12', 'final'],
    ['조별리그', '4강', '8강', '12강', '결승'],
  ])('경기 번호와 응답 순서보다 결선 규모를 우선한다 (%s)', (...rounds) => {
    const stages = buildTournamentStages(tournament({
      format: 'group_knockout',
      status: 'in_progress',
      fixtures: rounds.map((round, index) => fixture({
        round,
        fixtureNumber: index + 1,
        liveStatus: index === 2 ? 'live' : 'scheduled',
      })),
    }));

    expect(shape(stages)).toEqual([
      ['조별리그', 'done'],
      ['12강', 'done'],
      ['8강', 'active'],
      ['4강', 'upcoming'],
      ['결승', 'upcoming'],
      ['시상', 'upcoming'],
    ]);
  });

  it('각 라운드의 경기 번호가 1이어도 12강 → 8강 → 4강 → 결승으로 세운다', () => {
    const stages = buildTournamentStages(tournament({
      format: 'group_knockout',
      status: 'in_progress',
      fixtures: ['group', 'semi', 'quarter', 'round12', 'final'].map((round) => fixture({ round })),
    }));

    expect(stages.map((stage) => stage.label)).toEqual(['조별리그', '12강', '8강', '4강', '결승', '시상']);
  });

  it.each([
    ['group', 'semi', 'quarter', 'round16', 'final'],
    ['조별리그', '4강', '8강', '16강', '결승'],
  ])('16강이 있으면 16강 → 8강 → 4강 → 결승 순으로 세운다 (%s)', (...rounds) => {
    const stages = buildTournamentStages(tournament({
      format: 'group_knockout',
      status: 'in_progress',
      fixtures: rounds.map((round) => fixture({ round })),
    }));
    expect(stages.map((stage) => stage.label)).toEqual(['조별리그', '16강', '8강', '4강', '결승', '시상']);
  });

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
      ['시상', 'done'],
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
      ['시상', 'upcoming'],
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
      ['시상', 'upcoming'],
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

    expect(shape(stages).map(([label]) => label)).toEqual(['조별리그', '결승', '시상']);
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
      ['시상', 'upcoming'],
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

    expect(shape(stages).map(([label]) => label)).toEqual(['8강', '4강', '결승', '시상']);
  });

  it('라운드별로 fixtureNumber 가 1부터 다시 시작해도(동률) 결승은 항상 마지막이다 (alpha #ab100000 실측)', () => {
    const stages = buildTournamentStages(
      tournament({
        format: 'group_knockout',
        status: 'completed',
        // `/tournaments/:id` 는 `round asc` 로 정렬해 내려주므로 알파벳순('final' < 'group'
        // < 'semi')에 따라 결승이 배열 맨 앞에 온다 — 그리고 각 라운드의 fixtureNumber 는
        // 1부터 다시 시작해 semi(1,2)와 final(1)이 동률이다. 둘 다 실제 alpha 응답 그대로다.
        fixtures: [
          fixture({ round: 'final', fixtureNumber: 1, liveStatus: 'ended', status: 'completed' }),
          fixture({ round: 'group', fixtureNumber: 1, liveStatus: 'ended', status: 'completed' }),
          fixture({ round: 'group', fixtureNumber: 2, liveStatus: 'ended', status: 'completed' }),
          fixture({ round: 'group', fixtureNumber: 3, liveStatus: 'ended', status: 'completed' }),
          fixture({ round: 'semi', fixtureNumber: 1, liveStatus: 'ended', status: 'completed' }),
          fixture({ round: 'semi', fixtureNumber: 2, liveStatus: 'ended', status: 'completed' }),
        ],
      }),
    );

    expect(shape(stages).map(([label]) => label)).toEqual(['조별리그', '4강', '결승', '시상']);
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
      ['시상', 'upcoming'],
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

    expect(shape(stages).map(([label]) => label)).toEqual(['조별리그', '4강', '결승', '시상']);
  });

  it('대진이 하나도 없는 조별+토너먼트도 출발점과 목적지는 보여준다', () => {
    const stages = buildTournamentStages(
      tournament({ format: 'group_knockout', status: 'in_progress', fixtures: [] }),
    );

    expect(shape(stages)).toEqual([
      ['조별리그', 'upcoming'],
      ['결승', 'upcoming'],
      ['시상', 'upcoming'],
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
      ['시상', 'upcoming'],
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
      ['시상', 'upcoming'],
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

    // 리그는 두 칸(풀리그 · 시즌 종료)이다. 조별/4강/결승 칸이 하나라도 있으면 틀렸다.
    expect(shape(stages)).toEqual([
      ['풀리그', 'active'],
      ['시즌 종료', 'upcoming'],
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

    expect(stages.map((s) => s.label)).not.toContain('풀리그');
    expect(stages.map((s) => s.label)).toContain('조별리그');
  });
});

it('6강 전용 방식은 일반 8강·4강 명칭 대신 6강→준결승→결승을 표시한다', () => {
  const value = tournament({ format: 'knockout', status: 'in_progress', fixtures: [fixture({ round: '6강', liveStatus: 'live' })] });
  value.sixTeamMode = true;
  expect(buildTournamentStages(value).map(row => row.label)).toEqual(['6강', '준결승', '결승', '시상']);
});

describe('buildTournamentStages — 시상 칸', () => {
  const knockoutFixtures = [
    fixture({ round: 'final', fixtureNumber: 1, liveStatus: 'ended', status: 'completed' }),
    fixture({ round: 'semi', fixtureNumber: 1, liveStatus: 'ended', status: 'completed' }),
  ];

  it('결승이 끝났어도 대회가 아직 끝나지 않았으면 시상은 예정이다 — 지금 봐야 할 단계가 된다', () => {
    const stages = buildTournamentStages(tournament({ format: 'knockout', status: 'in_progress', fixtures: knockoutFixtures }));

    expect(shape(stages)).toEqual([['4강', 'done'], ['결승', 'done'], ['시상', 'upcoming']]);
    expect(pickFocusStageIndex(stages)).toBe(2);
  });

  it('대회가 끝나면 시상까지 전부 완료다 — 끝난 대회가 진행 중으로 읽히면 안 된다', () => {
    const stages = buildTournamentStages(tournament({ format: 'knockout', status: 'completed', fixtures: knockoutFixtures }));

    expect(shape(stages)).toEqual([['4강', 'done'], ['결승', 'done'], ['시상', 'done']]);
    expect(stages.some((stage) => stage.status === 'active')).toBe(false);
  });

  it('끝난 리그도 풀리그와 시즌 종료가 모두 완료다', () => {
    const stages = buildTournamentStages(
      tournament({
        format: 'group_knockout',
        kind: 'regular_league',
        status: 'completed',
        fixtures: [fixture({ round: '1라운드', fixtureNumber: 1, liveStatus: 'ended', status: 'completed' })],
      }),
    );

    expect(shape(stages)).toEqual([['풀리그', 'done'], ['시즌 종료', 'done']]);
  });
});

/**
 * alpha 실측(2026-11-07 목업 대회): 두 토너먼트가 같은 단계를 치르는 대회의 결선 그룹은
 * `상위 토너먼트 · 12강`·`하위 토너먼트 · 12강` 이고, 부전승이 있는 첫 라운드는 단계 코드가
 * `round16` 인데 경기 이름은 `12강` 이다.
 */
describe('buildTournamentStages — 두 토너먼트가 같은 단계를 치를 때', () => {
  function track(id: string, phase: string, name: string, bracketTrack: string, sortOrder = 0): V1TournamentGroup {
    return { id, phase, name, bracketTrack, sortOrder, advanceCount: null, groupTeams: [], standings: [], qualification: null };
  }
  const groups = [
    track('u12', 'round16', '상위 토너먼트 · 12강', '상위 토너먼트'),
    track('l12', 'round16', '하위 토너먼트 · 12강', '하위 토너먼트'),
    track('u8', 'quarter', '상위 토너먼트 · 8강', '상위 토너먼트'),
    track('l8', 'quarter', '하위 토너먼트 · 8강', '하위 토너먼트'),
    track('uf', 'final', '상위 토너먼트 · 결승', '상위 토너먼트'),
    track('lf', 'final', '하위 토너먼트 · 결승', '하위 토너먼트'),
  ];
  const twoTracks = () => tournament({
    format: 'league_knockouts',
    status: 'in_progress',
    fixtures: [
      fixture({ groupId: null, round: 'league_r1', fixtureNumber: 1, liveStatus: 'ended' }),
      fixture({ groupId: 'u12', round: '12강', fixtureNumber: 1, liveStatus: 'ended' }),
      fixture({ groupId: 'l12', round: '12강', fixtureNumber: 1, liveStatus: 'live' }),
      fixture({ groupId: 'u8', round: '8강', fixtureNumber: 1 }),
      fixture({ groupId: 'l8', round: '8강', fixtureNumber: 1 }),
      fixture({ groupId: 'uf', round: '결승', fixtureNumber: 1 }),
      fixture({ groupId: 'lf', round: '결승', fixtureNumber: 1 }),
    ],
  });
  const withGroups = (value: V1TournamentDetail): V1TournamentDetail => ({ ...value, groups });

  it('단계 이름은 라운드 이름만 쓴다 — 두 토너먼트 이름을 이어붙이지 않는다', () => {
    const stages = buildTournamentStages(withGroups(twoTracks()));

    expect(shape(stages)).toEqual([
      ['조별리그', 'done'],
      ['12강', 'active'],
      ['8강', 'upcoming'],
      ['결승', 'upcoming'],
      ['시상', 'upcoming'],
    ]);
  });

  it('칸마다 함께 치르는 토너먼트 이름을 알려 주고 조별리그·시상에는 붙이지 않는다', () => {
    const stages = buildTournamentStages(withGroups(twoTracks()));

    expect(stages.map((stage) => stage.parallelTracks)).toEqual([
      undefined,
      ['상위 토너먼트', '하위 토너먼트'],
      ['상위 토너먼트', '하위 토너먼트'],
      ['상위 토너먼트', '하위 토너먼트'],
      undefined,
    ]);
  });

  it('토너먼트 이름은 운영자가 만든 순서로 나온다 — 경기 번호 순서가 아니다', () => {
    const stages = buildTournamentStages(
      tournament({
        format: 'league_knockouts',
        status: 'in_progress',
        // 챌린지 경기가 번호가 앞서도 프리미어(sortOrder 100대)가 먼저 만들어진 토너먼트다.
        fixtures: [
          fixture({ groupId: 'c8', round: '8강', fixtureNumber: 1 }),
          fixture({ groupId: 'p8', round: '8강', fixtureNumber: 2 }),
        ],
        groups: [
          track('p8', 'quarter', '프리미어 · 8강', '프리미어', 101),
          track('c8', 'quarter', '챌린지 · 8강', '챌린지', 201),
        ],
      }),
    );

    expect(stages.find((stage) => stage.label === '8강')?.parallelTracks).toEqual(['프리미어', '챌린지']);
  });

  it('토너먼트가 하나뿐이면 운영자가 정한 단계 이름을 그대로 쓴다', () => {
    const stages = buildTournamentStages(
      tournament({
        format: 'group_knockout',
        status: 'in_progress',
        fixtures: [
          fixture({ round: '조별 1라운드', fixtureNumber: 1, liveStatus: 'ended' }),
          fixture({ groupId: 'named-final', round: 'final', fixtureNumber: 1 }),
        ],
        groups: [{ ...track('named-final', 'final', '최종 결승', 'overall') }],
      }),
    );

    expect(shape(stages).map(([label]) => label)).toEqual(['조별리그', '최종 결승', '시상']);
    expect(stages.every((stage) => stage.parallelTracks === undefined)).toBe(true);
  });
});
