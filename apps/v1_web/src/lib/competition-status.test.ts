import { describe, expect, it } from 'vitest';
import {
  arrivalCheckInUsed,
  bracketNodeStateChip,
  countLeagueFixturePhases,
  gameRosterStatusChip,
  gameStateChip,
  leagueFixtureCountChips,
  leagueFixturePhase,
  leagueSeasonStage,
  leagueSeasonStageLine,
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

  it('일찍 시작한 경기는 "예정" 집계에 들지 않는다 — 시즌 줄·칩이 같은 함수를 탄다', () => {
    const counts = countLeagueFixturePhases([fixture({ gameState: 'LIVE' }), fixture({ gameState: 'ENDED' }), fixture()], NOW);
    expect(counts).toEqual({ scheduled: 1, awaitingResult: 1, live: 1, ended: 0 });
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
    expect(leagueStateChip('active', { withSubject: true }).label).toBe('리그 · 진행 중');
    expect(matchPhaseChip('live', { withSubject: true }).label).toBe('경기 · 진행 중');
    expect(matchPhaseChip('scheduled', { withSubject: true }).label).toBe('경기 · 예정');
  });

  it.each([
    ['draft', '준비 중'],
    ['active', '진행 중'],
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

describe('순위표 자리의 시즌 단계', () => {
  const two = [fixture(), fixture({ startAt: '2026-10-14T12:00:00Z' })];

  it('한 경기도 안 치렀으면 시즌 시작 전 — 첫 경기 시각을 말한다(옛 "확인 중" 상자 대신)', () => {
    const counts = countLeagueFixturePhases(two, NOW);
    expect(counts).toEqual({ scheduled: 2, awaitingResult: 0, live: 0, ended: 0 });
    const stage = leagueSeasonStage('active', counts);
    expect(stage).toBe('preseason');
    expect(leagueSeasonStageLine(stage, { counts, nextStartLabel: '10/7 (수) 21:00' })).toEqual({
      title: '시즌 시작 전',
      text: '첫 경기 10/7 (수) 21:00부터 순위가 생겨요',
    });
    expect(leagueFixtureCountChips(counts).map((chip) => chip.label)).toEqual(['예정 2', '결과 대기 0', '종료 0']);
  });

  it('킥오프가 지났는데 결과가 없으면 결과 대기 — 그 경기 수를 센다', () => {
    const counts = countLeagueFixturePhases([fixture({ startAt: PAST }), fixture()], NOW);
    const stage = leagueSeasonStage('active', counts);
    expect(stage).toBe('awaiting_result');
    expect(leagueSeasonStageLine(stage, { counts, nextStartLabel: null })?.text).toBe('킥오프가 지난 1경기의 결과를 기다려요');
  });

  it('결과가 쌓이면 진행 중, 리그가 끝나면 줄이 없다', () => {
    const counts = countLeagueFixturePhases([fixture({ startAt: PAST, homeScore: 2, awayScore: 1 }), fixture()], NOW);
    expect(leagueSeasonStage('active', counts)).toBe('in_progress');
    expect(leagueSeasonStage('completed', counts)).toBe('completed');
    expect(leagueSeasonStageLine('completed', { counts, nextStartLabel: null })).toBeNull();
  });

  it('취소 대진은 집계에서 빠지고, 진행 중 칩은 있을 때만 붙는다', () => {
    const counts = countLeagueFixturePhases(
      [fixture({ status: 'cancelled' }), fixture({ startAt: PAST, gameState: 'LIVE' })],
      NOW,
    );
    expect(counts).toEqual({ scheduled: 0, awaitingResult: 0, live: 1, ended: 0 });
    expect(leagueFixtureCountChips(counts).map((chip) => chip.label)).toContain('진행 중 1');
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
