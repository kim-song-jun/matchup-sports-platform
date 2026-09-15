/**
 * 웨이브 3(2026-09-04 감사): 사진 없는 매치에 목업 사진이 붙던 폴백, 재시도 없는 오류 화면,
 * 위저드 2단계 크롬 누락을 못박는다.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { queryImageBySrc } from '@/test/next-image';
import { toMatchCard } from './matches.card-model';
import { sportIllustration } from '@/components/v1-ui/sport-illustration';
import { getMatchListViewModel, getMatchStateViewModel } from './matches.view-model';
import { MatchListPageView, MatchStatePageView } from './matches-page';
import { resolveRouteChrome } from '@/lib/route-chrome';
import type { V1Match } from '@/types/api';

vi.mock('next/link', () => ({ default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => <a href={href} {...rest}>{children}</a> }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }), usePathname: () => '/matches' }));
vi.mock('@/components/v1-ui/shell-override', () => ({ useShellOverride: () => undefined }));

const base = getMatchListViewModel();
const apiMatch = { matchId: 'm1', title: '실제 매치', imageUrl: null, sport: { name: '풋살' }, startsAt: '2026-09-09T04:16:00.000Z', status: 'open', participantCount: 1, capacity: 2 } as unknown as V1Match;

describe('사진 없는 매치', () => {
  it('toMatchCard 는 imageUrl 이 없으면 목업 사진으로 메우지 않고 null 을 준다', () => {
    expect(toMatchCard(apiMatch, base.matches[0]).image).toBeNull();
    expect(base.matches[0].image).toBeTruthy();
  });

  it('종목 그래픽 이름은 운영 4종목 전용, 그 외는 공용', () => {
    expect(sportIllustration('축구')).toBe('sport-soccer');
    expect(sportIllustration('풋살')).toBe('sport-futsal');
    expect(sportIllustration('러닝')).toBe('sport-running');
    expect(sportIllustration('수영')).toBe('sport-swimming');
    expect(sportIllustration('배드민턴')).toBe('landing-hero');
    expect(sportIllustration(undefined)).toBe('landing-hero');
  });

  /**
   * 176px 이상으로 그려지는 자리는 오브젝트 셋(삼각 구도)을 요구하고, 76px 썸네일은 둘을
   * 요구한다(agy-3d-graphic 스킬). 한 파일로 둘 다 만족시킬 수 없어 자리별로 파일을 나눈다.
   */
  it('hero 자리는 오브젝트 셋짜리 전용 판을 고른다', () => {
    expect(sportIllustration('축구', 'hero')).toBe('sport-soccer-hero');
    expect(sportIllustration('풋살', 'hero')).toBe('sport-futsal-hero');
    expect(sportIllustration('러닝', 'hero')).toBe('sport-running-hero');
    expect(sportIllustration('수영', 'hero')).toBe('sport-swimming-hero');
  });

  it('landing-hero 는 이미 오브젝트 셋이라 hero 판을 따로 두지 않는다', () => {
    // -hero 를 붙이면 없는 파일을 가리켜 404 가 된다.
    expect(sportIllustration('배드민턴', 'hero')).toBe('landing-hero');
    expect(sportIllustration(undefined, 'hero')).toBe('landing-hero');
  });

  it('variant 를 안 주면 카드 판이다 — 목록 썸네일이 hero 판으로 바뀌지 않는다', () => {
    expect(sportIllustration('풋살')).toBe(sportIllustration('풋살', 'card'));
  });

  it('목록 카드는 사진 대신 종목 그래픽을 그린다', () => {
    const model = { ...base, matches: [{ ...toMatchCard(apiMatch, base.matches[0]) }], isLoading: false };
    const { container } = render(<MatchListPageView model={model} />);
    expect(container.querySelector('.tm-match-media-sport')).not.toBeNull();
    expect(queryImageBySrc(container, '/illustrations/sport-futsal-640.webp')).not.toBeNull();
  });
});

describe('오류 화면', () => {
  it('ErrorState + 재시도 버튼을 그리고 retry 를 호출한다', () => {
    const retry = vi.fn();
    render(<MatchStatePageView model={{ ...getMatchStateViewModel('error'), retry }} />);
    expect(screen.getByRole('alert')).toHaveTextContent('매치 목록을 불러오지 못했어요');
    fireEvent.click(screen.getByRole('button', { name: '다시 불러오기' }));
    expect(retry).toHaveBeenCalledTimes(1);
  });
});

describe('빈 상태 CTA', () => {
  it('필터가 걸려 있을 때만 "전체 매치 보기" 링크를 준다', () => {
    const filtered = { ...base, matches: [], isLoading: false, filterCount: 1 };
    const { container, unmount } = render(<MatchListPageView model={filtered} />);
    expect(container.querySelector('a.tm-btn-primary[href="/matches"]')).not.toBeNull();
    unmount();
    const plain = { ...base, matches: [], isLoading: false, filterCount: 0, sports: base.sports.map((s) => ({ ...s, active: s.label === '전체' })) };
    const r2 = render(<MatchListPageView model={plain} />);
    expect(r2.container.querySelector('a.tm-btn-primary[href="/matches"]')).toBeNull();
  });
});

describe('위저드 크롬', () => {
  it('/matches/new 는 상세(/matches/:id)가 아니라 매치 만들기 크롬을 받는다', () => {
    const resolved = resolveRouteChrome('/matches/new');
    expect(resolved?.chrome.title).toBe('매치 만들기');
    expect(resolved?.chrome.backHref).toBe('/matches');
    expect(resolveRouteChrome('/matches/new/complete')?.chrome.title).not.toBe('매치 만들기 완료');
  });
});
