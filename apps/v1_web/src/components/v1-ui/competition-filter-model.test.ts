import { describe, expect, it } from 'vitest';
import {
  buildCompetitionFilterModel,
  leagueStateToListStatus,
  statusFiltersFor,
  resolveSportIdParam,
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

/**
 * **URL 은 사용자가 편집하는 입력이다.** 아래 셋은 전부 실제로 만들어지는 주소이고, 막지
 * 않으면 서버가 400 을 내 **목록이 통째로 에러**가 된다(빈 화면이 아니라 에러다).
 */
describe('URL 이 손상돼도 목록이 죽지 않는다', () => {
  /**
   * `'toString' in M` 은 **true** 다 — `in` 은 프로토타입 체인을 본다. "모르는 값은 null"
   * 이라는 원래 의도가 프로토타입 키에는 안 걸렸다.
   */
  it('프로토타입 키는 상태로 통과하지 않는다', () => {
    expect(leagueStateToListStatus('toString')).toBeNull();
    expect(leagueStateToListStatus('constructor')).toBeNull();
    expect(leagueStateToListStatus('__proto__')).toBeNull();
  });

  it('빈 문자열은 없는 것과 같다 — 그대로 넘기면 서버가 400 이다', () => {
    expect(leagueStateToListStatus('')).toBeNull();

    const m = buildCompetitionFilterModel({
      basePath: '/tournaments',
      params: new URLSearchParams('status=&sportId='),
      sports: SPORTS,
    });
    // 요약이 빈 값을 필터로 세지 않는다.
    expect(m.summary).toBe('전체');
    expect(m.activeCount).toBe(0);
    // '전체' 칩이 활성이어야 한다 — 빈 문자열을 값으로 취급하면 어느 칩도 활성이 아니다.
    expect(m.statusOptions.find((o) => o.value === 'all')?.active).toBe(true);
    expect(m.sportOptions[0].active).toBe(true);
  });
});

/**
 * **"준비 중" 은 정규 리그에만 있다.** 대회 탭에서 고르면 항상 0건인데, 데이터가 새는 게
 * 아니라 **고를 수 있는 것처럼 보이는 것**이 문제다 — 빈 목록을 사용자는 "고장" 으로 읽는다.
 */
describe('statusFiltersFor — 고를 수 없는 칩은 안 보여준다', () => {
  it('대회 탭에는 "준비 중" 이 없다', () => {
    expect(statusFiltersFor('tournament').map((o) => o.label)).toEqual(['전체', '진행 중', '종료']);
  });

  it('대조군: 리그·전체 탭에는 그대로 있다 — 칩을 통째로 없앤 게 아니다', () => {
    for (const kind of ['league', 'all', null, undefined]) {
      expect(statusFiltersFor(kind).map((o) => o.label)).toEqual([
        '전체',
        '진행 중',
        '준비 중',
        '종료',
      ]);
    }
  });

  it('모델도 같은 규칙을 따른다 — 대회 탭 시트에 draft 링크가 없다', () => {
    const m = buildCompetitionFilterModel({
      basePath: '/tournaments',
      params: new URLSearchParams('kind=tournament'),
      sports: SPORTS,
    });
    expect(m.statusOptions.some((o) => o.value === 'draft')).toBe(false);

    const league = buildCompetitionFilterModel({
      basePath: '/tournaments',
      params: new URLSearchParams('kind=league'),
      sports: SPORTS,
    });
    expect(league.statusOptions.some((o) => o.value === 'draft')).toBe(true);
  });
});

/**
 * `?sportId=abc` 하나로 **목록이 통째로 400** 이다(실측). `status` 에만 걸어 둔
 * *"URL 은 사용자 입력"* 전제를 종목에도 적용한다.
 */
describe('resolveSportIdParam — 모르는 종목을 서버로 넘기지 않는다', () => {
  const sports = [{ id: 's-futsal' }, { id: 's-basket' }];

  it('마스터 목록에 있는 값만 넘긴다', () => {
    expect(resolveSportIdParam({ raw: 's-futsal', sports, sportsLoaded: true })).toBe('s-futsal');
  });

  it('모양이 틀린 값은 안 넘긴다 — 서버가 400 이다', () => {
    expect(resolveSportIdParam({ raw: 'abc', sports, sportsLoaded: true })).toBeUndefined();
  });

  /**
   * 모양은 맞는데 없는 값은 서버가 200·빈 결과를 준다 — 400 보다 덜 나쁘지만, 마스터 목록을
   * 이미 들고 있으니 여기서 함께 거른다.
   */
  it('모양은 맞아도 목록에 없으면 안 넘긴다', () => {
    const uuid = '00000000-0000-4000-8000-000000000000';
    expect(resolveSportIdParam({ raw: uuid, sports, sportsLoaded: true })).toBeUndefined();
  });

  it('빈 문자열·null 은 없는 것과 같다', () => {
    expect(resolveSportIdParam({ raw: '', sports, sportsLoaded: true })).toBeUndefined();
    expect(resolveSportIdParam({ raw: null, sports, sportsLoaded: true })).toBeUndefined();
  });

  /**
   * ⚠️ **눈에 잘 안 띄고 재현이 어려운 자리다.** 로딩 중에 걸러 버리면 링크로 공유받은
   * 사람이 **필터가 한 번 풀렸다 돌아오는 깜빡임**을 본다 — 정상 링크마다 매번 생긴다.
   * 그대로 넘기면 손상된 주소에서만 잠깐 400 이 났다가 목록이 도착하며 스스로 낫는다.
   */
  it('마스터 목록이 오기 전에는 판단을 보류한다 — 정상 링크가 깜빡이면 안 된다', () => {
    expect(resolveSportIdParam({ raw: 's-futsal', sports: [], sportsLoaded: false })).toBe('s-futsal');
  });

  it('대조군: 목록이 도착한 뒤에는 같은 값도 걸러진다 — 보류가 영구 통과는 아니다', () => {
    expect(resolveSportIdParam({ raw: 'abc', sports: [], sportsLoaded: false })).toBe('abc');
    expect(resolveSportIdParam({ raw: 'abc', sports, sportsLoaded: true })).toBeUndefined();
  });
});
