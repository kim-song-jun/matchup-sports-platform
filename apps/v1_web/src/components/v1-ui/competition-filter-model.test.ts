import { describe, expect, it } from 'vitest';
import {
  buildCompetitionFilterModel,
  leagueStateToListStatus,
  LEAGUE_STATE_TO_LIST_STATUS,
} from './competition-filter-model';

const SPORTS = [
  { id: 's-futsal', label: '풋살' },
  { id: 's-basket', label: '농구' },
];

const model = (query: string) =>
  buildCompetitionFilterModel({
    basePath: '/tournaments',
    params: new URLSearchParams(query),
    sports: SPORTS,
  });

/**
 * **상태값 이름이 축마다 다르다** — 이게 리디렉트의 함정이다.
 * 리그 축은 `active` 인데 목록 status 는 `in_progress` 다. 그대로 넘기면 서버가 400 이다.
 */
describe('leagueStateToListStatus — 축 사이 이름이 다르다', () => {
  it('active 는 in_progress 로 옮긴다 — 그대로 넘기면 400 이다', () => {
    expect(leagueStateToListStatus('active')).toBe('in_progress');
  });

  it('draft·completed 는 같은 이름이라 그대로다', () => {
    expect(leagueStateToListStatus('draft')).toBe('draft');
    expect(leagueStateToListStatus('completed')).toBe('completed');
  });

  /**
   * 모르는 값을 조용히 통과시키면 서버에서 400 이 나는데, 그때는 원인이 URL 인지 화면인지
   * 구분이 안 된다. **여기서 끊는다.**
   */
  it('모르는 값은 null 이다 — 조용히 통과시키지 않는다', () => {
    expect(leagueStateToListStatus('open')).toBeNull();
    expect(leagueStateToListStatus('')).toBeNull();
    expect(leagueStateToListStatus(null)).toBeNull();
    expect(leagueStateToListStatus(undefined)).toBeNull();
  });

  it('매핑은 리그 축 세 값을 모두 덮는다 — 하나라도 빠지면 그 칩이 죽는다', () => {
    expect(Object.keys(LEAGUE_STATE_TO_LIST_STATUS).sort()).toEqual(
      ['active', 'completed', 'draft'],
    );
  });
});

describe('buildCompetitionFilterModel — URL 이 권위다', () => {
  it('시트 열림·닫힘이 URL 이다 — 뒤로가기로 닫히고 링크로 공유된다', () => {
    const m = model('kind=league');
    expect(m.openHref).toBe('/tournaments?kind=league&filter=1');
    expect(m.closeHref).toBe('/tournaments?kind=league');
  });

  /**
   * `kind` 는 필터가 아니라 **어느 목록을 보는가**다. 함께 지우면 리그 탭에서 초기화했는데
   * 대회 목록으로 튄다 — 사용자가 고른 탭이 사라지는 것이라 초기화의 뜻과 다르다.
   */
  it('초기화는 필터만 지운다 — kind(유형 탭)는 남는다', () => {
    const m = model('kind=league&status=draft&sportId=s-futsal&filter=1');
    expect(m.resetHref).toBe('/tournaments?kind=league');
  });

  it('상태 칩 넷이 사용자 확정값 그대로다', () => {
    expect(model('').statusOptions.map((o) => o.label)).toEqual([
      '전체',
      '진행 중',
      '준비 중',
      '종료',
    ]);
  });

  it('고른 상태가 활성으로 표시되고 다른 파라미터는 유지된다', () => {
    const m = model('kind=league&sportId=s-futsal&status=draft');
    const draft = m.statusOptions.find((o) => o.value === 'draft');
    expect(draft?.active).toBe(true);
    // 종목·유형이 링크에 그대로 실린다 — 하나 고르면 다른 게 풀리면 안 된다.
    expect(draft?.href).toContain('sportId=s-futsal');
    expect(draft?.href).toContain('kind=league');
  });

  it('요약은 고른 것만 적고, 아무것도 없으면 "전체" 다', () => {
    expect(model('kind=league').summary).toBe('전체');
    expect(model('kind=league').activeCount).toBe(0);
    expect(model('status=draft&sportId=s-futsal').summary).toBe('준비 중 · 풋살');
    expect(model('status=draft&sportId=s-futsal').activeCount).toBe(2);
  });

  /**
   * URL 은 사용자가 직접 편집할 수 있다. 모르는 status 가 오면 라벨이 없는데, 그때 그 값을
   * 그대로 적으면 **URL 문자열이 화면에 샌다.**
   */
  it('모르는 status 는 요약에 안 싣는다 — URL 문자열이 화면에 새면 안 된다', () => {
    const m = model('status=whatever');
    expect(m.summary).toBe('전체');
    expect(m.summary).not.toContain('whatever');
  });

  it('종목 목록 맨 앞은 항상 "전체" 이고 기본 상태에서 활성이다', () => {
    const m = model('kind=league');
    expect(m.sportOptions[0]).toMatchObject({ label: '전체', active: true });
    expect(m.sportOptions.map((o) => o.label)).toEqual(['전체', '풋살', '농구']);
  });
});
