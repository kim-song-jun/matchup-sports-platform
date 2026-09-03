import { act, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RouteProgressBar } from './route-progress';

// motion-audit 그룹3(F1 subtab) — kind==='tab' 클릭(하단탭·데스크톱 상단탭·화면 안
// 세부탭)에서 진행바가 켜지면 안 된다. globals.css 의 `:root[data-nav-kind='tab']` 이
// 이미 "탭 전환은 동위 전환이라 콘텐츠 애니메이션이 없다"를 확정했는데, 진행바만 그
// 원칙을 모르고 kind 를 무시한 채(onIntent: () => start()) 모든 내부 네비게이션에서
// 켜졌었다 — 그 결과 탭을 눌렀는데 콘텐츠는 안 바뀌고 얇은 바만 도는 상태가 최대
// ~1s 지속됐다(evidence-pack timelineMs). usePathname mock 은 항상 같은 값을 반환해
// "완료" 트리거(pathname 변화)가 켜지지 않게 해 active 상태만 관찰한다.
vi.mock('next/navigation', () => ({
  usePathname: () => '/tournaments',
}));

function clickAnchor(markup: string, href: string) {
  const host = document.createElement('div');
  host.innerHTML = markup;
  document.body.appendChild(host);
  const anchor = host.querySelector<HTMLAnchorElement>(`a[href="${href}"]`);
  if (!anchor) throw new Error(`앵커를 못 찾았다: ${href}`);
  // start()가 useState 를 건드리므로 act()로 감싸 리렌더를 동기적으로 flush 한다 —
  // 안 그러면 진행바가 실제로는 켜졌는데도(다음 tick에야 반영) 이 테스트에서 null 로 보인다.
  act(() => {
    anchor.click();
  });
  return host;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('RouteProgressBar — kind별 진행바 발화', () => {
  it("kind='tab' 링크(세부 탭) 클릭에서는 진행바가 뜨지 않는다", () => {
    const { container } = render(<RouteProgressBar />);

    clickAnchor(
      '<nav class="tm-segmented-tabs"><a class="tm-segmented-tab" href="/tournaments?kind=league">리그</a></nav>',
      '/tournaments?kind=league',
    );

    expect(container.querySelector('.tm-route-progress')).toBeNull();
  });

  it("kind='push' 링크(탭 밖 일반 링크) 클릭에서는 진행바가 뜬다", () => {
    const { container } = render(<RouteProgressBar />);

    clickAnchor('<div><a href="/tournaments/1">대회 상세</a></div>', '/tournaments/1');

    expect(container.querySelector('.tm-route-progress')).not.toBeNull();
  });

  it("kind='tab' 링크(하단 탭) 클릭에서도 진행바가 뜨지 않는다", () => {
    const { container } = render(<RouteProgressBar />);

    clickAnchor('<nav class="tm-bottom-nav"><a class="tm-bottom-tab" href="/teams">팀</a></nav>', '/teams');

    expect(container.querySelector('.tm-route-progress')).toBeNull();
  });
});
