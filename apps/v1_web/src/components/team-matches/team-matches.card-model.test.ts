/**
 * `matches.card-model.test.ts` 와 같은 계약 — 누르면 실제로 필터가 걸리는 링크만 만든다.
 */
import { describe, expect, it } from 'vitest';
import { buildSportChips, getStatus, sortTeamMatchesByAvailability, statusToCardStatus, toTeamMatch } from './team-matches.card-model';
import { getTeamMatchListViewModel } from './team-matches.view-model';
import type { V1Sport, V1TeamMatch, V1TeamMatchApiStatus, V1TeamMatchViewerState } from '@/types/api';

const base = getTeamMatchListViewModel();
const futsal = { id: 'uuid-futsal', name: '풋살', levels: [] } as unknown as V1Sport;
const matches = [{ id: 'tm1', sport: { id: 's', name: '풋살' } }] as unknown as V1TeamMatch[];

describe('buildSportChips', () => {
  it('마스터 종목이 있으면 그 ID 로 필터 링크를 만든다', () => {
    const chips = buildSportChips({ base, params: new URLSearchParams(), matches, sports: [futsal] });

    expect(chips.find((c) => c.label === '풋살')?.href).toBe('/team-matches?sportId=uuid-futsal');
  });

  it('마스터 종목이 없으면 종목 칩에 링크를 붙이지 않는다', () => {
    const chips = buildSportChips({ base, params: new URLSearchParams(), matches });

    for (const chip of chips.slice(1)) {
      expect(chip.href, `${chip.label} 칩에 링크가 붙었다`).toBeUndefined();
    }
  });

  it("'전체' 칩은 마스터가 없어도 링크를 유지한다", () => {
    const chips = buildSportChips({ base, params: new URLSearchParams(), matches });

    expect(chips[0].href).toBe('/team-matches');
  });
});

/**
 * 목록과 상세가 서로 다른 상태를 말하던 결함(2026-09-07 제보: "밖에서는 모집중으로 뜨고
 * 안에서는 신청 마감")의 프론트 쪽 방어선. 서버가 displayState 를 실어주면 그걸 쓰지만,
 * 안 실어주는 응답이 섞여도 마감된 팀매치를 '모집 중'으로 그리면 안 된다.
 */
describe('getStatus — 마감 판정', () => {
  const past = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  // getStatus 는 status/displayState/deadlineAt 세 필드만 읽는다 — 전체 V1TeamMatch 를
  // 지어내면 무엇을 보는 함수인지 오히려 흐려진다.
  const teamMatch = (overrides: { status: string; displayState?: string; deadlineAt: string | null }) =>
    overrides as unknown as V1TeamMatch;

  it('displayState 가 없어도 신청 마감이 지났으면 closed 로 본다', () => {
    expect(getStatus(teamMatch({ status: 'recruiting', deadlineAt: past }))).toBe('closed');
  });

  it('마감이 아직 남았으면 recruiting 그대로다', () => {
    expect(getStatus(teamMatch({ status: 'recruiting', deadlineAt: future }))).toBe('recruiting');
  });

  it('마감 자체가 없으면 recruiting 그대로다 (마감 없음 = 시작 전까지 받는다)', () => {
    expect(getStatus(teamMatch({ status: 'recruiting', deadlineAt: null }))).toBe('recruiting');
  });

  it('서버 displayState 가 더 구체적이면 그 값을 그대로 쓴다', () => {
    expect(getStatus(teamMatch({ status: 'recruiting', displayState: 'expired', deadlineAt: past }))).toBe('expired');
    expect(getStatus(teamMatch({ status: 'recruiting', displayState: 'matched', deadlineAt: future }))).toBe('matched');
  });
});

describe('sortTeamMatchesByAvailability', () => {
  it('신청 가능한 팀 매치를 먼저 두고 각 상태 그룹의 서버 순서는 유지한다', () => {
    const items = [
      { id: 'matched-new', status: 'matched' },
      { id: 'open-new', status: 'recruiting' },
      { id: 'deadline-closed', status: 'recruiting', deadlineAt: new Date(Date.now() - 60_000).toISOString() },
      { id: 'open-old', status: 'recruiting' },
    ] as unknown as V1TeamMatch[];

    expect(sortTeamMatchesByAvailability(items).map((item) => item.id)).toEqual([
      'open-new',
      'open-old',
      'matched-new',
      'deadline-closed',
    ]);
    expect(items.map((item) => item.id)).toEqual(['matched-new', 'open-new', 'deadline-closed', 'open-old']);
  });
});

/**
 * `closed` 는 **보는 사람과 무관하게** API status 만으로 정해진다.
 *
 * `statusToCardStatus()` 는 viewerState 를 먼저 보므로 호스트에게는 항상 'mine' 을 준다 —
 * 그 한 필드에 마감 여부까지 기대면, 매치를 만든 사람만 자기 매치가 마감된 걸 목록에서
 * 알 수 없다(2026-09-07 확인). 그래서 두 값이 서로 독립인지 여기서 못박는다.
 */
describe('toTeamMatch — 마감 여부는 관계와 독립이다', () => {
  const apiClosedStates = ['matched', 'closed', 'cancelled', 'completed', 'expired'] as const;

  function card(status: V1TeamMatchApiStatus, viewerState: V1TeamMatchViewerState) {
    return toTeamMatch({ id: 'tm1', title: 't', displayState: status, viewerState } as unknown as V1TeamMatch, base.matches[0]);
  }

  it('호스트가 봐도 마감된 매치는 closed=true 다 — status 는 그대로 mine', () => {
    apiClosedStates.forEach((apiStatus) => {
      const model = card(apiStatus, 'host_team');
      expect(model.status).toBe('mine');
      expect(model.closed).toBe(true);
    });
  });

  // 열린 상태의 API 값은 'recruiting' 이다 — 'open' 은 카드 모델 쪽 값이라
  // 여기에 쓰면 서버가 보내지 않는 입력을 검증하게 된다.
  it('호스트의 열린 매치는 closed=false 다', () => {
    const model = card('recruiting', 'host_team');
    expect(model.status).toBe('mine');
    expect(model.closed).toBe(false);
  });

  it('신청자·승인자가 봐도 마감 여부는 같은 값이다', () => {
    (['requested', 'approved'] as const).forEach((viewerState) => {
      expect(card('closed', viewerState).closed).toBe(true);
      expect(card('recruiting', viewerState).closed).toBe(false);
    });
  });

  it('관계가 없으면 status 와 closed 가 함께 마감을 가리킨다', () => {
    const model = card('closed', 'none');
    expect(model.status).toBe('closed');
    expect(model.closed).toBe(true);
  });

  it('정렬은 viewerState 를 안 쓰므로 이 변경에 영향받지 않는다', () => {
    // sortTeamMatchesByAvailability 는 statusToCardStatus(getStatus(item)) 를 인자 하나로 부른다.
    expect(statusToCardStatus('closed')).toBe('closed');
    expect(statusToCardStatus('recruiting')).toBe('open');
  });
});
