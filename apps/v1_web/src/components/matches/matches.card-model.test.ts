/**
 * 종목 칩의 링크 계약 — **누르면 실제로 필터가 걸리는 링크만 만든다.**
 * 서버 프리렌더가 마스터 종목 없이도 이 함수를 호출하므로 두 경로를 모두 고정한다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatDeadline, formatDeadlineDetail, toMatchCard, buildSportSummary, sortMatchesByAvailability } from './matches.card-model';
import { getMatchListViewModel } from './matches.view-model';
import type { V1Match, V1Sport } from '@/types/api';

const base = getMatchListViewModel();
const futsal = { id: 'uuid-futsal', name: '풋살', levels: [] } as unknown as V1Sport;

function match(sportName: string): V1Match {
  return { id: 'm1', matchId: 'm1', sport: { id: 's', name: sportName }, startsAt: '2026-10-01T00:00:00.000Z' } as unknown as V1Match;
}

describe('buildSportSummary', () => {
  it('마스터 종목이 있으면 그 ID 로 필터 링크를 만든다', () => {
    const chips = buildSportSummary(new URLSearchParams(), [match('풋살')], base, undefined, [futsal]);

    expect(chips.find((c) => c.label === '풋살')?.href).toBe('/matches?sportId=uuid-futsal');
  });

  it('마스터 종목이 없으면 종목 칩에 링크를 붙이지 않는다', () => {
    // 예전에는 sportId 없는 `/matches` 로 링크해, 눌러도 필터가 걸리지 않는 '가짜 필터'가 됐다.
    const chips = buildSportSummary(new URLSearchParams(), [match('풋살')], base);

    for (const chip of chips.slice(1)) {
      expect(chip.href, `${chip.label} 칩에 링크가 붙었다`).toBeUndefined();
    }
  });

  it("'전체' 칩은 마스터가 없어도 링크를 유지한다 — 필터 해제는 sportId 없이도 유효하다", () => {
    const chips = buildSportSummary(new URLSearchParams(), [match('풋살')], base);

    expect(chips[0].href).toBe('/matches');
  });

  it('마스터에 없는 종목만 링크가 빠진다', () => {
    const chips = buildSportSummary(new URLSearchParams(), [match('풋살')], base, undefined, [futsal]);

    expect(chips.find((c) => c.label === '풋살')?.href).toBeDefined();
    expect(chips.find((c) => c.label === '축구')?.href).toBeUndefined();
  });
});

describe('sortMatchesByAvailability', () => {
  it('신청 가능한 매치를 먼저 두고 각 상태 그룹의 서버 순서는 유지한다', () => {
    const items = [
      { id: 'closed-new', status: 'closed' },
      { id: 'open-new', status: 'recruiting' },
      { id: 'full', status: 'recruiting', displayState: 'full' },
      { id: 'open-old', status: 'recruiting' },
    ] as unknown as V1Match[];

    expect(sortMatchesByAvailability(items).map((item) => item.id)).toEqual([
      'open-new',
      'open-old',
      'closed-new',
      'full',
    ]);
    expect(items.map((item) => item.id)).toEqual(['closed-new', 'open-new', 'full', 'open-old']);
  });
});

/**
 * [P2] 회귀 가드: formatDeadlineDetail은 예전에 status==='full'(정원 마감·마감 시각 지남 모두
 * 포함)이면 실제 마감 시각과 무관하게 캔드 문구 '신청 마감'을 반환했다 — 그래서 /matches/[id]의
 * "신청 마감" InfoRow가 정작 마감 시각(9월 26일 16:40)을 한 번도 보여주지 못했다(P2 대표
 * 시나리오). 이제 값이 있으면 상태와 무관하게 항상 실제 날짜·시각을 반환한다.
 */
describe('formatDeadline / formatDeadlineDetail — 실제 시각(사실) 계약', () => {
  const NOW = new Date('2026-09-26T08:00:00.000Z'); // KST 2026-09-26 17:00

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('마감 시각이 지났으면 status 와 무관하게 실제 날짜·시각을 값으로, "지났어요"를 캡션으로 준다', () => {
    const past = '2026-09-26T07:40:00.000Z'; // KST 16:40, NOW(17:00) 보다 20분 전
    expect(formatDeadlineDetail(past)).toBe('9월 26일 (토) 16:40');
    expect(formatDeadline(past)).toBe('지났어요');
  });

  it('마감 시각이 남아 있으면 실제 날짜·시각 + 상대 캡션을 준다', () => {
    const in3Hours = '2026-09-26T11:00:00.000Z'; // KST 20:00, NOW(17:00) 보다 3시간 뒤
    expect(formatDeadlineDetail(in3Hours)).toBe('9월 26일 (토) 20:00');
    expect(formatDeadline(in3Hours)).toBe('마감 3시간 전');
  });

  it('마감 시각이 없으면 값은 "경기 시작 전까지", 캡션은 빈 문자열(중복 표시 방지)', () => {
    expect(formatDeadlineDetail(null)).toBe('경기 시작 전까지');
    expect(formatDeadline(null)).toBe('');
  });

  it('toMatchCard: 정원이 남아 있어도 마감 시각이 지나 닫힌 매치는 실제 시각을 그대로 노출한다', () => {
    const base = getMatchListViewModel();
    const closedPastDeadline = {
      id: 'm-closed',
      matchId: 'm-closed',
      status: 'closed',
      startsAt: '2026-09-27T12:45:00.000Z',
      deadlineAt: '2026-09-26T07:40:00.000Z',
      participantCount: 1,
      capacity: 5,
    } as unknown as V1Match;

    const card = toMatchCard(closedPastDeadline, base.matches[0]);

    expect(card.status).toBe('full');
    expect(card.deadlineDetail).toBe('9월 26일 (토) 16:40');
    expect(card.deadline).toBe('지났어요');
  });
});
