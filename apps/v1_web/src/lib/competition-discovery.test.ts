import { describe, expect, it } from 'vitest';
import { competitionDiscoveryHref, competitionStageRows, discoveryRangeError, readCompetitionDiscovery, switchCompetitionKind } from './competition-discovery';

const read = (query: string, kind: 'all' | 'tournament' | 'league' = 'all') => readCompetitionDiscovery(new URLSearchParams(query), kind);

describe('대회·리그 필터 URL 계약', () => {
  it('상태 필터 하나로 진행 중인 리그를 조회한다', () => {
    expect(read('stage=ongoing', 'league')).toMatchObject({ kind: 'league', stage: 'ongoing' });
  });
  it('대회에서 리그로 이동할 때 공통 조건만 유지한다', () => {
    const changed = switchCompetitionKind(read('sportId=sport&stage=recruiting&genderCategory=mixed&format=league&feeMax=10000&dateFrom=2026-11-01', 'tournament'), 'league');
    const url = new URL(competitionDiscoveryHref(changed), 'https://example.test');
    expect(Object.fromEntries(url.searchParams)).toEqual({ kind: 'league', stage: 'recruiting', sportId: 'sport', dateFrom: '2026-11-01' });
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
  it.each(['preparing', 'recruiting', 'recruit_closed', 'ongoing', 'completed'])('상태 %s 를 주소에서 읽고 다시 쓴다', (stage) => {
    expect(read(`stage=${stage}`, 'league').stage).toBe(stage);
    expect(competitionDiscoveryHref(read(`stage=${stage}`, 'league'))).toBe(`/tournaments?kind=league&stage=${stage}`);
  });
  it('대회 탭에는 준비 중 상태가 없다', () => {
    expect(read('stage=preparing', 'tournament').stage).toBeUndefined();
    expect(switchCompetitionKind(read('stage=preparing', 'league'), 'tournament').stage).toBeUndefined();
    const rows = (kind: 'all' | 'tournament' | 'league') => competitionStageRows(kind).map((row) => [row.title, row.options.map((option) => option.label)]);
    expect(rows('tournament')).toEqual([['모집 상태', ['신청 접수 중', '접수 마감']], ['진행 상태', ['진행 중', '종료']]]);
    expect(rows('league')).toEqual([['모집 상태', ['신청 접수 중', '접수 마감']], ['진행 상태', ['준비 중', '진행 중', '종료']]]);
    expect(rows('all')).toEqual(rows('league'));
  });
  it('옛 정렬·진행·모집 링크 값은 읽지 않는다', () => {
    const result = read('sort=deadline&phase=ongoing&registration=open', 'league');
    expect(result).toEqual({ kind: 'league' });
    expect(competitionDiscoveryHref(result)).toBe('/tournaments?kind=league');
  });
  it('기존 status 링크를 상태 필터로 옮긴다', () => {
    expect(read('status=draft', 'league').stage).toBe('preparing');
    expect(read('status=open', 'league').stage).toBe('recruiting');
    expect(read('status=closed', 'league').stage).toBe('recruit_closed');
    expect(read('status=in_progress', 'league').stage).toBe('ongoing');
    expect(read('status=completed', 'league').stage).toBe('completed');
  });
  it('잘못된 날짜·금액·enum을 서버 입력으로 넘기지 않는다', () => {
    const result = read('stage=no&dateFrom=2026-02-30&dateTo=bad&feeMin=-1&feeMax=99999999999&genderCategory=no', 'tournament');
    expect(competitionDiscoveryHref(result)).toBe('/tournaments?kind=tournament');
    expect(read('dateFrom=0000-01-01').dateFrom).toBeUndefined();
  });
  it('기간과 금액 역전은 적용 전 오류를 표시한다', () => {
    expect(discoveryRangeError(read('dateFrom=2026-11-30&dateTo=2026-11-01'))).toEqual({ field: 'date', message: expect.stringContaining('종료 날짜') });
    expect(discoveryRangeError(read('feeMin=100&feeMax=0', 'tournament'))).toEqual({ field: 'fee', message: expect.stringContaining('최대 참가비') });
  });
  it('성별 미지정과 무료를 명시적으로 보존한다', () => {
    expect(competitionDiscoveryHref(read('genderCategory=unspecified&feeMax=0', 'tournament'))).toBe('/tournaments?kind=tournament&genderCategory=unspecified&feeMax=0');
  });
});
