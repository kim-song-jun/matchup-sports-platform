import { describe, expect, it } from 'vitest';
import {
  arrivalCheckInUsed,
  bracketNodeStateChip,
  disciplineWarningChip,
  gameRosterStatusChip,
  gameStateChip,
  leagueFixturePhase,
  leagueStateChip,
  matchPhaseChip,
  rosterPermissionHint,
  shouldOfferRecordClaim,
  splitByArrival,
  withPublicRecordGameState,
} from './competition-status';

const NOW = Date.parse('2026-09-30T12:00:00Z');
const PAST = '2026-09-29T12:00:00Z';
const FUTURE = '2026-10-07T12:00:00Z';

function fixture(overrides: Partial<Parameters<typeof leagueFixturePhase>[0]> = {}) {
  return { status: 'matched', startAt: FUTURE, homeScore: null, awayScore: null, ...overrides };
}

describe('leagueFixturePhase — 리그 대진 한 경기의 단계', () => {
  it.each([
    ['킥오프 전 matched', fixture(), 'scheduled'],
    ['킥오프가 지난 matched(결과 미제출)', fixture({ startAt: PAST }), 'awaiting_result'],
    ['completed 인데 점수 없음', fixture({ status: 'completed' }), 'awaiting_result'],
    ['확정 점수', fixture({ startAt: PAST, homeScore: 1, awayScore: 0 }), 'ended'],
    ['점수 비공개(확정)', fixture({ startAt: PAST, scoreHidden: true }), 'ended'],
    ['어드민이 본 진행 중 경기', fixture({ startAt: PAST, gameState: 'LIVE' }), 'live'],
    ['취소는 점수가 있어도 취소', fixture({ status: 'cancelled', homeScore: 1, awayScore: 0 }), 'cancelled'],
    // W4-V13 — 게임 상태가 있으면 킥오프 예정 시각보다 먼저 본다.
    ['예정 시각 전에 시작한 경기', fixture({ gameState: 'LIVE' }), 'live'],
    ['예정 시각 전에 끝난 경기(결과 미확정)', fixture({ gameState: 'ENDED' }), 'awaiting_result'],
    ['게임이 취소된 경기', fixture({ gameState: 'CANCELLED' }), 'cancelled'],
    ['게임이 시작 전이면 시각대로', fixture({ gameState: 'SCHEDULED' }), 'scheduled'],
  ] as const)('%s → %s', (_, input, expected) => {
    expect(leagueFixturePhase(input, NOW)).toBe(expected);
  });
});

describe('withPublicRecordGameState — 경기 상세가 기록 응답으로 단계를 정한다', () => {
  it('기록이 끝났다고 하면 대진 목록의 낡은 LIVE 를 덮는다', () => {
    const stale = fixture({ gameState: 'LIVE' });
    expect(leagueFixturePhase(withPublicRecordGameState(stale, 'ended'), NOW)).toBe('awaiting_result');
    expect(leagueFixturePhase(withPublicRecordGameState(fixture(), 'live'), NOW)).toBe('live');
  });

  it('기록이 없거나 모르는 값이면 대진 그대로다', () => {
    const live = fixture({ gameState: 'LIVE' });
    expect(withPublicRecordGameState(live, undefined)).toBe(live);
    expect(withPublicRecordGameState(live, 'something_new')).toBe(live);
  });
});

describe('리그 상태 × 경기 상태 — 한 화면에 함께면 대상을 붙여 가른다', () => {
  it('같은 "진행 중"이라도 리그와 경기가 서로 다른 칩 문구가 된다', () => {
    expect(leagueStateChip('active', { withSubject: true }).label).toBe('리그 · 시즌 진행 중');
    expect(matchPhaseChip('live', { withSubject: true }).label).toBe('경기 · 진행 중');
    expect(matchPhaseChip('scheduled', { withSubject: true }).label).toBe('경기 · 예정');
  });

  it.each([
    ['draft', '시작 전'],
    ['active', '시즌 진행 중'],
    ['completed', '종료'],
  ] as const)('리그 %s 는 대상 없이 "%s"', (state, label) => {
    expect(leagueStateChip(state).label).toBe(label);
  });

  it('운영 상태는 경기 단계 문구를 같이 쓰고, 모르는 값은 칩이 없다', () => {
    expect(gameStateChip('SCHEDULED')?.label).toBe('예정');
    expect(gameStateChip('PAUSED')?.label).toBe('일시 중지');
    expect(gameStateChip('SOMETHING_NEW')).toBeNull();
  });
});

describe('경고 누적 칩', () => {
  const rules = { yellowAccumulationLimit: 3 as number | null };

  it('한도 사이에 쌓인 장수만 센다 — 정지로 소진된 장수는 뺀다', () => {
    expect(disciplineWarningChip({ yellowTotal: 1 }, rules)).toEqual({ label: '경고 1/3장', tone: 'grey', icon: null });
    expect(disciplineWarningChip({ yellowTotal: 4 }, rules)?.label).toBe('경고 1/3장');
    expect(disciplineWarningChip({ yellowTotal: 3 }, rules)).toBeNull();
  });

  it('한 장 더 받으면 정지인 선수는 같은 칩에 그 사실이 붙고 톤이 달라진다', () => {
    expect(disciplineWarningChip({ yellowTotal: 2 }, rules)).toEqual({ label: '경고 2/3장 · 한 장 더 받으면 정지', tone: 'orange', icon: null });
    expect(disciplineWarningChip({ yellowTotal: 1 }, { yellowAccumulationLimit: 2 })?.tone).toBe('orange');
  });

  it('규정이 없거나 경고 규정이 꺼졌거나 한도가 1장이면 칩이 없다', () => {
    expect(disciplineWarningChip({ yellowTotal: 2 }, null)).toBeNull();
    expect(disciplineWarningChip({ yellowTotal: 2 }, { yellowAccumulationLimit: null })).toBeNull();
    expect(disciplineWarningChip({ yellowTotal: 1 }, { yellowAccumulationLimit: 1 })).toBeNull();
    expect(disciplineWarningChip(null, rules)).toBeNull();
  });
});

describe('기본 상태는 무표시 — 바뀐 것만 칩', () => {
  it('출전은 칩이 없고, 빠짐·결장·출전정지는 칩이 붙는다', () => {
    expect(gameRosterStatusChip('PARTICIPATING')).toBeNull();
    expect(gameRosterStatusChip('EXCLUDED', { reason: 'INJURY' })?.label).toBe('빠짐 · 부상');
    expect(gameRosterStatusChip('UNAVAILABLE', { reason: 'PERSONAL' })?.label).toBe('결장 · 개인 사정');
    expect(gameRosterStatusChip('SUSPENDED', { remainingMatches: 2 })?.label).toBe('출전정지 2경기');
  });

  it('명단을 바꿀 수 있는 사람에겐 권한 안내가 없다', () => {
    expect(rosterPermissionHint(true)).toBeNull();
    expect(rosterPermissionHint(false)).toBe('팀장·매니저만 명단을 바꿀 수 있어요.');
  });
});

describe('내 기록 연결 입구', () => {
  it('경기 시작 전에는 누구에게도 없다', () => {
    expect(shouldOfferRecordClaim({ gameState: 'SCHEDULED', viewerRow: undefined })).toBe(false);
  });

  it('시작 뒤엔 계정이 연결된 사람에게는 없고, 명단에 없거나 계정 없이 기록되는 사람에게만', () => {
    expect(shouldOfferRecordClaim({ gameState: 'ENDED', viewerRow: { accountLinked: true } })).toBe(false);
    expect(shouldOfferRecordClaim({ gameState: 'ENDED', viewerRow: { accountLinked: false } })).toBe(true);
    expect(shouldOfferRecordClaim({ gameState: 'LIVE', viewerRow: undefined })).toBe(true);
  });
});

describe('도착 확인 그룹', () => {
  const people = [
    { id: 'a', arrivedAt: '2026-09-30T11:00:00Z' },
    { id: 'b', arrivedAt: null },
  ];

  it('아무도 도착 확인을 안 했으면 가르지 않는다', () => {
    expect(arrivalCheckInUsed([{ arrivedAt: null }, { arrivedAt: null }])).toBe(false);
    expect(arrivalCheckInUsed(people)).toBe(true);
  });

  it('도착 확인·도착 전으로 나눈다', () => {
    const split = splitByArrival(people);
    expect(split.arrived.map((row) => row.id)).toEqual(['a']);
    expect(split.pending.map((row) => row.id)).toEqual(['b']);
  });
});

describe('bracketNodeStateChip', () => {
  it.each([
    ['scheduled', '예정', 'grey', 'clock'],
    ['live', '진행 중', 'blue', 'live'],
    ['submitted', '확정 전', 'orange', 'hourglass'],
    ['official', '확정', 'green', 'check'],
    ['cancelled', '취소', 'red', 'cancel'],
  ] as const)('%s → 글자 %s · 톤 %s · 아이콘 %s (색만으로 전달하지 않는다)', (state, label, tone, icon) => {
    expect(bracketNodeStateChip(state)).toEqual({ label, tone, icon });
  });
});
