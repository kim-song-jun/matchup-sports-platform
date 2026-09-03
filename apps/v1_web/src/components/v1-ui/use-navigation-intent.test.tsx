import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useNavigationIntent, type NavigationIntentKind } from './use-navigation-intent';

// 이 파일이 지키는 것은 하나다 — **어떤 클릭이 'tab' 으로 분류되는가**.
//
// 'tab' 이 아니면 page-transition-controller 가 data-nav-kind="push" 를 심고, 그러면
// 페이지 이동용 슬라이드 전환이 그대로 재생된다. 실제로 판별이 `.tm-bottom-nav` 하나뿐이던
// 동안 세부 탭 세 그룹과 데스크톱 상단 탭이 전부 push 로 잡혔고, "탭 전환에서 전환을 끈다"는
// CSS(`:root[data-nav-kind="tab"]`)가 **한 번도 발화하지 않았다**. CSS 만 보고는 알 수 없는
// 결함이라 여기서 분류 자체를 못박는다.

function Harness({ onIntent }: { onIntent: (kind: NavigationIntentKind) => void }) {
  useNavigationIntent({ onIntent });
  return null;
}

function clickAnchor(markup: string, href: string) {
  const host = document.createElement('div');
  host.innerHTML = markup;
  document.body.appendChild(host);
  const anchor = host.querySelector<HTMLAnchorElement>(`a[href="${href}"]`);
  if (!anchor) throw new Error(`앵커를 못 찾았다: ${href}`);
  anchor.click();
  return host;
}

afterEach(() => {
  document.body.innerHTML = '';
  window.history.replaceState(null, '', '/home');
});

describe('useNavigationIntent — 탭으로 분류되는 클릭', () => {
  it.each([
    ['하단 탭(모바일)', '<nav class="tm-bottom-nav"><a class="tm-bottom-tab" href="/teams">팀</a></nav>', '/teams'],
    ['데스크톱 상단 탭', '<div class="tm-desktop-nav-tabs"><a class="tm-desktop-nav-tab" href="/teams">팀</a></div>', '/teams'],
    // 아래 셋이 이번에 실제로 깨져 있던 것들이다.
    ['세부 탭 — 경로가 바뀌는 것', '<nav class="tm-segmented-tabs"><a class="tm-segmented-tab" href="/team-matches">팀</a></nav>', '/team-matches'],
    ['세부 탭 — 쿼리만 바뀌는 것', '<nav class="tm-segmented-tabs"><a class="tm-segmented-tab" href="/home?kind=league">리그</a></nav>', '/home?kind=league'],
  ])('%s → tab', (_name, markup, href) => {
    const onIntent = vi.fn();
    render(<Harness onIntent={onIntent} />);

    clickAnchor(markup, href);

    expect(onIntent).toHaveBeenCalledWith('tab');
  });

  it('탭 밖의 평범한 링크는 그대로 push 다(가드가 전부를 tab 으로 만들지 않는다)', () => {
    const onIntent = vi.fn();
    render(<Harness onIntent={onIntent} />);

    clickAnchor('<div><a href="/teams/1">팀 상세</a></div>', '/teams/1');

    expect(onIntent).toHaveBeenCalledWith('push');
  });

  it('data-nav-back 링크는 tab 보다 뒤가 아니라 pop 이다', () => {
    const onIntent = vi.fn();
    render(<Harness onIntent={onIntent} />);

    clickAnchor('<div><a href="/teams" data-nav-back="true">뒤로</a></div>', '/teams');

    expect(onIntent).toHaveBeenCalledWith('pop');
  });
});

describe("useNavigationIntent — 'search' 분류(FS-1: pathname 동일·search 만 다른 이동)", () => {
  // 필터 시트(칩 선택·열기/닫기)가 만드는 링크가 정확히 이 모양이다 — pathname 은
  // 그대로고 쿼리스트링만 바뀐다. 이걸 'push'로 두면 필터 시트 자체 애니메이션 위에
  // 페이지 전체 슬라이드+페이드가 겹쳐 재생된다(alpha 실측, FS-1).
  it('탭 컨테이너 밖에서 pathname 동일·search 만 바뀌면 search 다', () => {
    const onIntent = vi.fn();
    render(<Harness onIntent={onIntent} />);
    window.history.replaceState(null, '', '/tournaments?status=upcoming');

    clickAnchor('<div><a href="/tournaments?status=ended">종료</a></div>', '/tournaments?status=ended');

    expect(onIntent).toHaveBeenCalledWith('search');
  });

  it('쿼리 전체가 사라지는 이동(닫기)도 search 다', () => {
    const onIntent = vi.fn();
    render(<Harness onIntent={onIntent} />);
    window.history.replaceState(null, '', '/tournaments?status=upcoming');

    clickAnchor('<div><a href="/tournaments">닫기</a></div>', '/tournaments');

    expect(onIntent).toHaveBeenCalledWith('search');
  });

  it('세부 탭(.tm-segmented-tabs) 안이면 pathname 동일·search 만 바뀌어도 여전히 tab — search 재분류가 tab 을 삼키지 않는다', () => {
    // 이 케이스가 재분류 순서(반드시 tab 판별 뒤)의 핵심 회귀 방지 테스트다 — 재분류를
    // tab 판별보다 앞에 두면 이 테스트가 깨진다(실제로 초안에서 한 번 이렇게 깨졌다).
    const onIntent = vi.fn();
    render(<Harness onIntent={onIntent} />);
    window.history.replaceState(null, '', '/home');

    clickAnchor('<nav class="tm-segmented-tabs"><a class="tm-segmented-tab" href="/home?kind=league">리그</a></nav>', '/home?kind=league');

    expect(onIntent).toHaveBeenCalledWith('tab');
    expect(onIntent).not.toHaveBeenCalledWith('search');
  });

  it('pathname 이 달라지는 이동은 search 만이 함께 바뀌어도 그대로 push 다', () => {
    const onIntent = vi.fn();
    render(<Harness onIntent={onIntent} />);
    window.history.replaceState(null, '', '/tournaments');

    clickAnchor('<div><a href="/tournaments/123?tab=bracket">대회 상세</a></div>', '/tournaments/123?tab=bracket');

    expect(onIntent).toHaveBeenCalledWith('push');
  });
});

describe('useNavigationIntent — popstate 는 셸에 따라 갈린다', () => {
  afterEach(() => { delete document.documentElement.dataset.teameetNativeApp; });

  it('일반 브라우저·Android 의 popstate 는 pop (웹이 전환을 그린다)', () => {
    const onIntent = vi.fn();
    render(<Harness onIntent={onIntent} />);

    window.dispatchEvent(new PopStateEvent('popstate'));

    expect(onIntent).toHaveBeenCalledWith('pop');
  });

  it('iOS 셸의 popstate 는 native (네이티브가 이미 그렸으니 웹은 안 그린다)', () => {
    // WKWebView allowsBackForwardNavigationGestures 가 엣지 스와이프 슬라이드를 먼저 그린다.
    // 여기서 pop 을 주면 그 위에 웹 전환이 한 번 더 겹친다 — 사용자가 "iOS 에서 자체
    // 트랜지션과 겹친다"고 지적한 바로 그것이다.
    document.documentElement.dataset.teameetNativeApp = 'ios';
    const onIntent = vi.fn();
    render(<Harness onIntent={onIntent} />);

    window.dispatchEvent(new PopStateEvent('popstate'));

    expect(onIntent).toHaveBeenCalledWith('native');
    expect(onIntent).not.toHaveBeenCalledWith('pop');
  });

  it('iOS 셸이어도 클릭 뒤로가기(data-nav-back)는 그대로 pop — 네이티브가 안 그리는 경로', () => {
    document.documentElement.dataset.teameetNativeApp = 'ios';
    const onIntent = vi.fn();
    render(<Harness onIntent={onIntent} />);

    clickAnchor('<div><a href="/teams" data-nav-back="true">뒤로</a></div>', '/teams');

    expect(onIntent).toHaveBeenCalledWith('pop');
  });
});

