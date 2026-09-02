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
