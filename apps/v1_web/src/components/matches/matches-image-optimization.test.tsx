/**
 * 매치 화면의 업로드 사진은 CSS 배경이라 next/image 를 거치지 않는다. 자리 크기에 맞춘
 * `/_next/image` 주소로 받는지 — 원본 주소를 배경에 직접 넣으면 아래 단언이 깨진다.
 */
import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render as rtlRender } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MatchCreatePageView, MatchDetailPageView, MatchListPageView } from './matches-page';
import { getMatchCreateViewModel, getMatchDetailViewModel, getMatchListViewModel } from './matches.view-model';

vi.mock('next/navigation', () => ({
  usePathname: () => '/matches',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/components/v1-ui/shell-override', () => ({ useShellOverride: () => undefined }));

const UPLOAD = '/uploads/2026/11/match-photo.png';

function render(ui: ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return rtlRender(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

/** `url("…")` 한 개로 이뤄진 backgroundImage 에서 최적화 요청의 경로·원본·폭을 읽는다. */
function optimizerRequest(backgroundImage: string) {
  const quoted = /^url\("(.+)"\)$/.exec(backgroundImage);
  if (!quoted) throw new Error(`url("…") 형태가 아니에요: ${backgroundImage}`);
  const url = new URL(quoted[1], 'http://localhost');
  return { pathname: url.pathname, url: url.searchParams.get('url'), w: url.searchParams.get('w') };
}

function pick(container: HTMLElement, selector: string) {
  const element = container.querySelector<HTMLElement>(selector);
  expect(element, selector).not.toBeNull();
  return element!;
}

function listWith(image: string) {
  const base = getMatchListViewModel();
  const card = base.matches[0];
  return {
    ...base,
    isLoading: false,
    matches: [{ ...card, id: 'm-photo', image }],
    nearbyMatches: [{ ...card, id: 'm-nearby', image }],
  };
}

function createWith(step: 'info' | 'confirm', image: string) {
  const model = getMatchCreateViewModel(step);
  return { ...model, draft: { ...model.draft, image } };
}

describe('매치 상세 히어로', () => {
  function heroWith(image: string) {
    const base = getMatchDetailViewModel();
    const { container } = render(<MatchDetailPageView model={{ ...base, match: { ...base.match, image } }} />);
    return pick(container, '.tm-match-detail-hero');
  }

  it('휴대폰·태블릿은 1200 폭, 데스크톱은 3840 이 아니라 1920 폭 주소를 함께 싣는다', () => {
    const hero = heroWith(UPLOAD);

    expect(hero.classList.contains('tm-responsive-bg')).toBe(true);
    expect(optimizerRequest(hero.style.getPropertyValue('--tm-bg-image')))
      .toEqual({ pathname: '/_next/image', url: UPLOAD, w: '1200' });
    expect(optimizerRequest(hero.style.getPropertyValue('--tm-bg-image-wide')))
      .toEqual({ pathname: '/_next/image', url: UPLOAD, w: '1920' });
  });

  it('인라인 background-image 를 두지 않는다 — .tm-responsive-bg 가 폭에 맞는 쪽을 고르게 한다', () => {
    expect(heroWith(UPLOAD).style.backgroundImage).toBe('');
  });

  it('최적화할 수 없는 외부 사진은 두 속성이 같은 원본을 가리킨다', () => {
    const external = 'https://cdn.example.com/hero.png';
    const hero = heroWith(external);

    expect(hero.style.getPropertyValue('--tm-bg-image')).toBe(`url("${external}")`);
    expect(hero.style.getPropertyValue('--tm-bg-image-wide')).toBe(`url("${external}")`);
  });
});

describe('매치 목록', () => {
  it('행 썸네일(96px)은 256 폭으로 받는다', () => {
    const { container } = render(<MatchListPageView model={listWith(UPLOAD)} />);

    expect(optimizerRequest(pick(container, '.tm-match-row-thumb').style.backgroundImage))
      .toEqual({ pathname: '/_next/image', url: UPLOAD, w: '256' });
  });

  it('사진 레일과 인접 레일 카드(320px)는 640 폭으로 받는다', () => {
    const { container } = render(<MatchListPageView model={listWith(UPLOAD)} />);

    const media = Array.from(container.querySelectorAll<HTMLElement>('.tm-match-list-media'));
    expect(media).toHaveLength(2);
    for (const element of media) {
      expect(optimizerRequest(element.style.backgroundImage)).toEqual({ pathname: '/_next/image', url: UPLOAD, w: '640' });
    }
  });

  it('외부 주소는 최적화 서버가 받을 수 없으니 그대로 둔다', () => {
    const external = 'https://cdn.example.com/photo.jpg';
    const { container } = render(<MatchListPageView model={listWith(external)} />);

    expect(pick(container, '.tm-match-row-thumb').style.backgroundImage).toBe(`url("${external}")`);
  });
});

describe('매치 만들기 대표 이미지 미리보기', () => {
  it('입력 단계 미리보기(최대 600px)는 1200 폭으로 받는다', () => {
    const { container } = render(<MatchCreatePageView model={createWith('info', UPLOAD)} />);

    expect(optimizerRequest(pick(container, '.tm-create-image-preview').style.backgroundImage))
      .toEqual({ pathname: '/_next/image', url: UPLOAD, w: '1200' });
  });

  it('확인 단계 미리보기도 같은 폭으로 받는다', () => {
    const { container } = render(<MatchCreatePageView model={createWith('confirm', UPLOAD)} />);

    expect(optimizerRequest(pick(container, '.tm-create-image-preview').style.backgroundImage))
      .toEqual({ pathname: '/_next/image', url: UPLOAD, w: '1200' });
  });

  it('고른 로컬 파일(blob:) 미리보기는 그대로 보여 준다', () => {
    const blob = 'blob:http://localhost/3b1f6d2e-aaaa-bbbb-cccc-0123456789ab';
    const { container } = render(<MatchCreatePageView model={createWith('info', blob)} />);

    expect(pick(container, '.tm-create-image-preview').style.backgroundImage).toBe(`url("${blob}")`);
  });
});
