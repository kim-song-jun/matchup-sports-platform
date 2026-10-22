import { describe, expect, it } from 'vitest';
import { competitionDiscoveryHref, discoveryRangeError, readCompetitionDiscovery, switchCompetitionKind } from './competition-discovery';

const read = (query: string, kind: 'all' | 'tournament' | 'league' = 'all') => readCompetitionDiscovery(new URLSearchParams(query), kind);

describe('대회·리그 필터 URL 계약', () => {
  it('진행 중인 리그에서 신규 신청 접수를 별도 조건으로 조회한다', () => {
    expect(read('phase=ongoing&registration=open', 'league')).toMatchObject({ kind: 'league', phase: 'ongoing', registration: 'open' });
  });
  it('대회에서 리그로 이동할 때 공통 조건만 유지한다', () => {
    const changed = switchCompetitionKind(read('sportId=sport&phase=upcoming&registration=open&genderCategory=mixed&format=league&feeMax=10000&dateFrom=2026-11-01&sort=scheduled', 'tournament'), 'league');
    const url = new URL(competitionDiscoveryHref(changed), 'https://example.test');
    expect(Object.fromEntries(url.searchParams)).toEqual({ kind: 'league', phase: 'upcoming', registration: 'open', sportId: 'sport', dateFrom: '2026-11-01', sort: 'scheduled' });
  });
  it('리그에서는 대회 전용 필터를 요청으로 넘기지 않는다', () => {
    for (const kind of ['league'] as const) {
      expect(competitionDiscoveryHref(read('genderCategory=female&format=knockout&feeMin=100', kind))).not.toContain('genderCategory');
      expect(competitionDiscoveryHref(read('genderCategory=female&format=knockout&feeMin=100', kind))).not.toContain('feeMin');
    }
  });
  it('기존 전체 탭의 성별 공유 링크는 대회 탭으로 좁혀 조건을 보존한다', () => {
    expect(read('genderCategory=mixed')).toMatchObject({ kind: 'tournament', genderCategory: 'mixed' });
  });
  it('종료+접수중은 묵시적으로 조회 범위를 넓히지 않는다', () => {
    expect(read('phase=completed&registration=open')).toMatchObject({ phase: 'completed', registration: 'open' });
  });
  it('마감순 링크로 직접 들어와도 접수 중 조건을 표시·전달한다', () => {
    expect(competitionDiscoveryHref(read('sort=deadline'))).toContain('registration=open');
  });
  it('기존 리그 준비·진행·종료 링크를 공통 단계로 옮긴다', () => {
    expect(read('status=draft', 'league').phase).toBe('upcoming');
    expect(read('status=in_progress', 'league').phase).toBe('ongoing');
    expect(read('status=completed', 'league').phase).toBe('completed');
  });
  it('잘못된 날짜·금액·enum을 서버 입력으로 넘기지 않는다', () => {
    const result = read('phase=no&registration=no&dateFrom=2026-02-30&dateTo=bad&feeMin=-1&feeMax=99999999999&genderCategory=no&sort=no', 'tournament');
    expect(competitionDiscoveryHref(result)).toBe('/tournaments?kind=tournament');
    expect(read('dateFrom=0000-01-01').dateFrom).toBeUndefined();
  });
  it('기간과 금액 역전은 적용 전 오류를 표시한다', () => {
    expect(discoveryRangeError(read('dateFrom=2026-11-30&dateTo=2026-11-01'))).toContain('종료 날짜');
    expect(discoveryRangeError(read('feeMin=100&feeMax=0', 'tournament'))).toContain('최대 참가비');
  });
  it('성별 미지정과 무료를 명시적으로 보존한다', () => {
    expect(competitionDiscoveryHref(read('genderCategory=unspecified&feeMax=0', 'tournament'))).toBe('/tournaments?kind=tournament&genderCategory=unspecified&feeMax=0');
  });
});
