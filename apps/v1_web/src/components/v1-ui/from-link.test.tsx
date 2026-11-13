import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FromLink } from './from-link';

const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => router,
}));

function renderLink(props: Partial<ComponentProps<typeof FromLink>> = {}) {
  render(
    <FromLink href="/terms?document=privacy" {...props}>
      개인정보처리방침
    </FromLink>,
  );
  return screen.getByRole<HTMLAnchorElement>('link');
}

// 새 탭 열기 같은 브라우저 기본 동작이 링크 쪽에서 막히지 않았는지 본다. document 리스너는 React 루트
// 핸들러가 끝난 뒤에 돌므로 그 시점의 defaultPrevented 가 링크가 정한 값이고, 이어서 jsdom 의 이동 시도를 막는다.
function observeDefaultAction() {
  const observed = { prevented: undefined as boolean | undefined };
  document.addEventListener(
    'click',
    (event) => {
      observed.prevented = event.defaultPrevented;
      event.preventDefault();
    },
    { once: true },
  );
  return observed;
}

beforeEach(() => {
  router.push.mockClear();
  window.history.replaceState(null, '', '/tournaments');
});
afterEach(() => {
  window.history.replaceState(null, '', '/');
});

describe('FromLink', () => {
  it('서버 HTML 과 마운트 뒤 DOM 모두 출처 꼬리 없는 href 를 렌더한다', () => {
    window.history.replaceState(null, '', '/teams/t1?tab=info&from=%2Ftournaments#members');
    const link = renderLink();
    expect(link.getAttribute('href')).toBe('/terms?document=privacy');
    expect(link.getAttribute('href')).not.toContain('from=');
  });

  it('왼쪽 클릭은 그 순간의 쿼리와 앵커까지 담은 주소를 출처로 붙여 이동한다', () => {
    window.history.replaceState(null, '', '/tournaments?status=open#list');
    const link = renderLink();
    const observed = observeDefaultAction();
    fireEvent.click(link);
    expect(observed.prevented).toBe(true);
    expect(router.push).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledWith(
      '/terms?document=privacy&from=%2Ftournaments%3Fstatus%3Dopen%23list',
    );
  });

  it('렌더 뒤에 바뀐 주소도 클릭 시점의 것을 쓴다', () => {
    const link = renderLink();
    window.history.replaceState(null, '', '/teams/t2#members');
    fireEvent.click(link);
    expect(router.push).toHaveBeenCalledWith('/terms?document=privacy&from=%2Fteams%2Ft2%23members');
  });

  it('이미 출처를 받은 화면에서는 중첩 규칙대로 처음 출처를 이어 담는다', () => {
    window.history.replaceState(null, '', '/teams/t1?from=%2Ftournaments');
    fireEvent.click(renderLink());
    expect(router.push).toHaveBeenCalledWith(
      '/terms?document=privacy&from=%2Fteams%2Ft1%3Ffrom%3D%252Ftournaments',
    );
  });

  it('출처로 쓸 수 없는 화면(로그인)에서는 꼬리 없는 주소로 이동한다', () => {
    window.history.replaceState(null, '', '/login?redirect=%2Fmy');
    fireEvent.click(renderLink());
    expect(router.push).toHaveBeenCalledWith('/terms?document=privacy');
  });

  it('키보드 Enter 도 같은 길로 출처를 붙여 이동한다', async () => {
    window.history.replaceState(null, '', '/tournaments?status=open');
    const user = userEvent.setup();
    const link = renderLink();
    link.focus();
    await user.keyboard('{Enter}');
    expect(router.push).toHaveBeenCalledWith('/terms?document=privacy&from=%2Ftournaments%3Fstatus%3Dopen');
  });

  it.each(['ctrlKey', 'metaKey', 'shiftKey', 'altKey'] as const)(
    '%s 를 누른 클릭은 가로채지 않아 새 탭·창 열기가 그대로 동작한다',
    (modifier) => {
      const link = renderLink();
      const observed = observeDefaultAction();
      fireEvent.click(link, { [modifier]: true });
      expect(observed.prevented).toBe(false);
      expect(router.push).not.toHaveBeenCalled();
    },
  );

  it('왼쪽이 아닌 버튼의 클릭은 가로채지 않는다', () => {
    const link = renderLink();
    const observed = observeDefaultAction();
    fireEvent.click(link, { button: 1 });
    expect(observed.prevented).toBe(false);
    expect(router.push).not.toHaveBeenCalled();
  });

  it('target 이 있거나 download 링크면 가로채지 않는다', () => {
    const blank = renderLink({ target: '_blank' });
    const observedBlank = observeDefaultAction();
    fireEvent.click(blank);
    expect(observedBlank.prevented).toBe(false);
    expect(router.push).not.toHaveBeenCalled();
  });

  it('download 링크도 가로채지 않는다', () => {
    const link = renderLink({ download: true });
    const observed = observeDefaultAction();
    fireEvent.click(link);
    expect(observed.prevented).toBe(false);
    expect(router.push).not.toHaveBeenCalled();
  });

  it('download={false} 는 속성이 없는 것과 같아 일반 링크처럼 출처를 붙여 이동한다', () => {
    const link = renderLink({ download: false });
    expect(link.hasAttribute('download')).toBe(false);
    fireEvent.click(link);
    expect(router.push).toHaveBeenCalledWith('/terms?document=privacy&from=%2Ftournaments');
  });

  it('download="" 도 다운로드 링크라 가로채지 않는다', () => {
    const link = renderLink({ download: '' });
    expect(link.hasAttribute('download')).toBe(true);
    const observed = observeDefaultAction();
    fireEvent.click(link);
    expect(observed.prevented).toBe(false);
    expect(router.push).not.toHaveBeenCalled();
  });

  it.each(['https://example.com/terms', '//example.com/terms', '/\\example.com/terms'])(
    '사이트 밖을 가리키는 href(%s)는 가로채지도 현재 주소를 붙이지도 않는다',
    (href) => {
      window.history.replaceState(null, '', '/tournaments?status=open#list');
      const link = renderLink({ href });
      const observed = observeDefaultAction();
      fireEvent.click(link);
      expect(observed.prevented).toBe(false);
      expect(router.push).not.toHaveBeenCalled();
    },
  );

  it('호출한 쪽 onClick 이 기본 동작을 막았으면 이동하지 않는다', () => {
    const link = renderLink({ onClick: (event) => event.preventDefault() });
    fireEvent.click(link);
    expect(router.push).not.toHaveBeenCalled();
  });

  it('호출한 쪽 onClick 은 이동 전에 먼저 실행된다', () => {
    const order: string[] = [];
    router.push.mockImplementationOnce(() => order.push('push'));
    const link = renderLink({ onClick: () => order.push('onClick') });
    fireEvent.click(link);
    expect(order).toEqual(['onClick', 'push']);
  });

  it('prefetch 같은 링크 속성은 그대로 전달한다', () => {
    const link = renderLink({ className: 'foot', 'aria-label': '처리방침' });
    expect(link).toHaveClass('foot');
    expect(link).toHaveAttribute('aria-label', '처리방침');
  });
});
