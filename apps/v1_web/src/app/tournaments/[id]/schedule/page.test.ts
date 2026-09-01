import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * **정규 리그도 이 화면을 쓴다.**
 *
 * 한동안 여기서 `notFound()` 로 리그를 막았다. 그건 결함을 가린 것이었다 — 리그가
 * `/tournaments/:id` 통합 축을 통과하는데 클라이언트가 부르는 `/tournaments/:id/schedule`
 * 만 404 라 화면이 "경기 정보를 찾을 수 없어요" 로 끝났다. 그 API 가 리그를 응답하도록
 * 고쳐졌으므로(`leagueSchedule`) 막을 이유가 사라졌고, **이 파일의 단언도 함께 뒤집힌다.**
 *
 * ## 여기서 잡는 것과 못 잡는 것
 * ```
 * 잡는다    리그가 통과하는가 · 리그에 isLeague 가 켜져 내려가는가 · 색인 가능한가
 *          리그 방식 대회(format='league')가 리그 취급되지 않는가
 * 못 잡는다  HTTP 상태코드 — 이 라우트는 notFound() 를 불러도 200 이다(프레임워크 quirk,
 *          2026-09-01 재측정에서도 없는 id 로 200 · 형제는 404). 그건 별개 문제다.
 * ```
 */
const fetchPublicV1 = vi.fn();
const notFound = vi.fn(() => {
  // 실제 `notFound()` 는 던져서 렌더를 중단한다 — 그 성질을 흉내내야
  // "게이트 뒤 코드가 안 돈다" 를 검증할 수 있다.
  throw new Error('NEXT_NOT_FOUND');
});

vi.mock('next/navigation', () => ({ notFound: () => notFound() }));
vi.mock('next/dynamic', () => ({ default: () => () => null }));
/**
 * **메타데이터 빌더는 실제 구현을 쓴다 — mock 하지 않는다.**
 *
 * 처음엔 손으로 흉내냈는데 **둘 다 실물과 달랐다**:
 * ```
 * 내 mock                        실제 (lib/seo.ts)
 * public  → robots: undefined    robots: { index: true, follow: true }
 * noindex → {index,follow}       { index: false, follow: false, **nocache: true** }
 * ```
 * 그러면 *"색인 가능"* 의 의미가 코드베이스 표준과 달라지고, 실제 빌더가 바뀌어도 이 테스트는
 * 안 깨진다 — **픽스처가 실물과 다르면 여기서 통과하는 것이 프로덕션을 증명하지 못한다.**
 * 네트워크만 막고(`fetchPublicV1`) 나머지는 실물을 쓴다.
 */
vi.mock('@/lib/seo', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/seo')>()),
  fetchPublicV1: (...args: unknown[]) => fetchPublicV1(...args),
}));

const detail = (overrides: Record<string, unknown> = {}) => ({
  id: 't-1',
  title: '테스트',
  kind: 'regular_tournament',
  format: 'group_knockout',
  ...overrides,
});

async function load() {
  return import('./page');
}

beforeEach(() => {
  vi.resetModules();
  fetchPublicV1.mockReset();
  notFound.mockClear();
});

describe('일정 페이지 게이트', () => {
  it('정규 리그도 통과한다 — 막던 게이트를 걷어냈다', async () => {
    fetchPublicV1.mockResolvedValue(detail({ kind: 'regular_league', format: 'group_knockout' }));
    const { default: Page } = await load();

    await expect(Page({ params: Promise.resolve({ id: 'lg-1' }) })).resolves.toBeTruthy();
    expect(notFound).not.toHaveBeenCalled();
  });

  /**
   * 통과만으로는 부족하다 — 리그 어휘('정규 라운드' 칩)와 선수 기록 미렌더가 이 플래그
   * 하나에 달려 있어서, 안 넘어가면 리그 화면에 대회 말이 그대로 뜬다.
   */
  it('리그면 isLeague 를 켜서 내려보낸다 — 어휘와 선수 기록 노출이 여기 달렸다', async () => {
    fetchPublicV1.mockResolvedValue(detail({ kind: 'regular_league' }));
    const { default: Page } = await load();

    const element = await Page({ params: Promise.resolve({ id: 'lg-1' }) });
    expect(element.props).toMatchObject({ tournamentId: 'lg-1', isLeague: true });
  });

  it('대회에는 isLeague 를 켜지 않는다 — 대조군', async () => {
    fetchPublicV1.mockResolvedValue(detail());
    const { default: Page } = await load();

    const element = await Page({ params: Promise.resolve({ id: 't-1' }) });
    expect(element.props).toMatchObject({ isLeague: false });
  });

  it('대회는 통과한다 — 대조군', async () => {
    fetchPublicV1.mockResolvedValue(detail());
    const { default: Page } = await load();

    await expect(Page({ params: Promise.resolve({ id: 't-1' }) })).resolves.toBeTruthy();
    expect(notFound).not.toHaveBeenCalled();
  });

  /**
   * **`isLeagueCompetition` 을 쓰면 이 테스트가 red 가 된다.**
   * 그 헬퍼는 `format === 'league'` 도 true 로 주는데, 그건 **리그 방식으로 치르는 진짜 대회**다.
   * 2026-09-01 alpha 실측 — 대회 62건 중 `format='league'` 가 **7건**이고, 표본 `5bb5b6bb`
   * (`kind=regular_tournament · format=league`)는 이 페이지가 정상 렌더된다.
   * **헬퍼로 막으면 그 7건이 함께 막힌다.**
   */
  it('리그 방식으로 치르는 대회는 리그 취급하지 않는다 — kind 로 물어야 하는 이유', async () => {
    fetchPublicV1.mockResolvedValue(detail({ format: 'league', kind: 'regular_tournament' }));
    const { default: Page } = await load();

    const element = await Page({ params: Promise.resolve({ id: 't-league-format' }) });
    expect(notFound).not.toHaveBeenCalled();
    // **여기가 핵심이다.** `isLeagueCompetition` 을 썼다면 이 값이 true 가 되어 진짜 대회
    // 7건의 '결선' 칩이 '정규 라운드' 로 바뀌고 선수 기록 섹션이 사라졌을 것이다.
    expect(element.props).toMatchObject({ isLeague: false });
  });

  it('없는 대회는 그대로 막는다 — 기존 동작', async () => {
    fetchPublicV1.mockResolvedValue(null);
    const { default: Page } = await load();

    await expect(Page({ params: Promise.resolve({ id: 'nope' }) })).rejects.toThrow('NEXT_NOT_FOUND');
  });
});

/** 리그도 정상 화면이 되었으므로 **색인을 막을 이유가 없다.** 없는 대회만 noindex 다. */
describe('일정 페이지 메타데이터', () => {
  it('정규 리그도 색인 가능하다 — 더 이상 에러 화면이 아니다', async () => {
    fetchPublicV1.mockResolvedValue(detail({ kind: 'regular_league' }));
    const { generateMetadata } = await load();

    const meta = await generateMetadata({ params: Promise.resolve({ id: 'lg-1' }) });

    expect(meta.robots).toEqual({ index: true, follow: true });
  });

  it('없는 대회는 여전히 noindex 다 — 실제 buildNoIndexMetadata 형태 그대로', async () => {
    fetchPublicV1.mockResolvedValue(null);
    const { generateMetadata } = await load();

    const meta = await generateMetadata({ params: Promise.resolve({ id: 'nope' }) });

    expect(meta.robots).toEqual({ index: false, follow: false, nocache: true });
  });

  it('대회는 색인 가능하다 — 대조군', async () => {
    fetchPublicV1.mockResolvedValue(detail());
    const { generateMetadata } = await load();

    const meta = await generateMetadata({ params: Promise.resolve({ id: 't-1' }) });

    // 이 저장소의 "색인 가능" 은 **명시적 robots** 다(`undefined` 가 아니다).
    expect(meta.robots).toEqual({ index: true, follow: true });
  });
});
