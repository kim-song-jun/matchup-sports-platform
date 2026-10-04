/**
 * `matches.card-model.test.ts` 와 같은 계약 — 누르면 실제로 필터가 걸리는 링크만 만든다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildSportChips, getStatus, sortTeamMatchesByAvailability, statusToCardStatus, summarizeTeamMatches, toTeamMatch } from './team-matches.card-model';
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

describe('toTeamMatch — 플랫폼 운영 모집', () => {
  it('호스트팀이 없는 관리자 모집을 운영 주관 카드로 표시한다', () => {
    const model = toTeamMatch(
      {
        id: 'tm-platform',
        title: '주말 풋살 팀 모집',
        status: 'recruiting',
        displayState: 'recruiting',
        platformManaged: true,
        hostTeam: null,
      } as unknown as V1TeamMatch,
      base.matches[0],
    );

    expect(model.hostTeam).toBe('Teameet 운영');
    expect(model.platformManaged).toBe(true);
    expect(model.status).toBe('open');
  });

  it('팀 배정 뒤에도 플랫폼 주관 출처와 실제 홈팀을 함께 유지한다', () => {
    const model = toTeamMatch(
      {
        id: 'tm-platform-assigned',
        title: '플랫폼 배정 완료 매치',
        status: 'matched',
        displayState: 'matched',
        platformManaged: true,
        hostTeam: { teamId: 'team-home', name: '홈 유나이티드' },
        approvedOpponentTeam: { teamId: 'team-away', name: '어웨이 FC' },
      } as unknown as V1TeamMatch,
      base.matches[0],
    );

    expect(model.hostTeam).toBe('홈 유나이티드');
    expect(model.opponentTeam).toBe('어웨이 FC');
    expect(model.platformManaged).toBe(true);
    expect(model.closed).toBe(true);
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

describe('completed team-match card state', () => {
  it('preserves completed API status for the list badge', () => {
    const model = toTeamMatch(
      { id: 'completed', title: 'Completed', displayState: 'completed', viewerState: 'none' } as unknown as V1TeamMatch,
      base.matches[0],
    );

    expect(model.apiStatus).toBe('completed');
    expect(model.closed).toBe(true);
  });
});

describe('friendly match live card', () => {
  it('shows a matched game as live after kickoff but never a cancelled one', () => {
    const base = getTeamMatchListViewModel();
    const match = { id: 'live', title: 'Live', status: 'matched', startsAt: new Date(Date.now() - 60_000).toISOString() } as unknown as V1TeamMatch;
    expect(toTeamMatch(match, base.matches[0]).live).toBe(true);
    expect(toTeamMatch({ ...match, status: 'cancelled' } as unknown as V1TeamMatch, base.matches[0]).live).toBe(false);
  });

  it('switches from live to completion pending after the configured end time', () => {
    const now = Date.now();
    const match = {
      id: 'completion-pending',
      title: 'Completion pending',
      status: 'matched',
      startsAt: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
      endsAt: new Date(now - 60_000).toISOString(),
    } as unknown as V1TeamMatch;

    const model = toTeamMatch(match, base.matches[0]);

    expect(model.live).toBe(false);
    expect(model.completionPending).toBe(true);
  });
});

describe('summarizeTeamMatches — 목록 상단 요약', () => {
  // 2026-10-01 14:00 KST
  const NOW = new Date('2026-10-01T05:00:00.000Z');
  const item = (startsAt: string, status: V1TeamMatchApiStatus = 'recruiting') =>
    ({ id: startsAt + status, startsAt, status, deadlineAt: null }) as unknown as V1TeamMatch;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => vi.useRealTimers());

  it('오늘은 KST 날짜가 같은 건만 센다 (과거·미래 제외)', () => {
    const summary = summarizeTeamMatches([
      item('2026-10-01T10:00:00.000Z'), // 10/1 19:00 KST
      item('2026-10-01T01:00:00.000Z'), // 10/1 10:00 KST
      item('2026-09-30T05:00:00.000Z'), // 어제
      item('2026-10-06T05:00:00.000Z'), // 미래
    ]);

    expect(summary.count).toBe(4);
    expect(summary.today).toBe(2);
  });

  it('KST 자정 경계 — 14:59:59Z(23:59:59 KST)는 오늘, 15:00:00Z(익일 00:00 KST)는 내일이다', () => {
    const summary = summarizeTeamMatches([
      item('2026-10-01T14:59:59.000Z'),
      item('2026-10-01T15:00:00.000Z'),
      item('2026-09-30T15:00:00.000Z'), // 10/1 00:00 KST — UTC 날짜로는 어제
      item('2026-09-30T14:59:59.000Z'), // 9/30 23:59:59 KST
    ]);

    expect(summary.today).toBe(2);
  });

  it('모집 중은 실제로 신청을 받는 건만 센다 (마감·확정·취소·보류 제외)', () => {
    const summary = summarizeTeamMatches([
      item('2026-10-06T05:00:00.000Z', 'recruiting'),
      item('2026-10-07T05:00:00.000Z', 'recruiting'),
      item('2026-10-08T05:00:00.000Z', 'closed'),
      item('2026-10-09T05:00:00.000Z', 'matched'),
      item('2026-10-10T05:00:00.000Z', 'cancelled'),
      item('2026-10-11T05:00:00.000Z', 'on_hold'),
    ]);

    expect(summary.urgent).toBe(2);
  });

  it('신청 마감이 지난 recruiting 은 모집 중이 아니다', () => {
    const expired = { ...item('2026-10-06T05:00:00.000Z'), deadlineAt: '2026-09-30T00:00:00.000Z' } as V1TeamMatch;

    expect(summarizeTeamMatches([expired]).urgent).toBe(0);
  });

  it('결과가 0건이면 전부 0이다', () => {
    expect(summarizeTeamMatches([])).toEqual({ count: 0, today: 0, urgent: 0 });
  });
});

describe('toTeamMatch — 성별 조건 표시', () => {
  const modelFor = (genderRule: string | null) =>
    toTeamMatch(
      { id: 'tm-g', title: '성별 조건', status: 'recruiting', displayState: 'recruiting', hostTeam: null, genderRule } as unknown as V1TeamMatch,
      base.matches[0],
    );

  it.each([['성별 무관', '혼성'], ['남', '남'], ['여', '여']])('정본 값 %s 은 %s 로 보인다', (value, label) => {
    expect(modelFor(value).gender).toBe(label);
  });

  it.each(['any', '남녀 혼성', null])('정본이 아닌 값 %s 은 원문으로 노출하지 않는다', (value) => {
    expect(modelFor(value).gender).toBe('');
  });
});
