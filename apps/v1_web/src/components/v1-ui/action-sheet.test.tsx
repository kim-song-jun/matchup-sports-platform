import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { __resetOverlayHistoryForTests } from '@/lib/overlay-history';
import { bindSoftNavigator } from '@/lib/navigation-history';
import { ActionSheet, type ActionSheetAction } from './action-sheet';

const nav = vi.hoisted(() => ({ pathname: '/admin/league-matches/l-1' as string | null }));
vi.mock('next/navigation', () => ({ usePathname: () => nav.pathname }));

afterEach(() => {
  __resetOverlayHistoryForTests();
  nav.pathname = '/admin/league-matches/l-1';
});

function setup(actions: readonly ActionSheetAction[], open = true) {
  const onClose = vi.fn();
  render(<ActionSheet open={open} title="경기 더보기" actions={actions} onClose={onClose} />);
  return { onClose };
}

describe('ActionSheet', () => {
  it('닫혀 있으면 아무것도 그리지 않는다', () => {
    setup([{ key: 'a', label: '동작', onSelect: vi.fn() }], false);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('제목이 dialog 의 접근 이름이고 항목을 고르면 그 동작이 불린다', () => {
    const onSelect = vi.fn();
    setup([{ key: 'a', label: '결과 정정', description: '확정된 결과를 고쳐요', onSelect }]);

    const dialog = screen.getByRole('dialog', { name: '경기 더보기' });
    fireEvent.click(within(dialog).getByRole('button', { name: /^결과 정정/ }));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('href 항목은 버튼이 아니라 링크로 그려 이동 경로를 그대로 가진다', () => {
    setup([{ key: 'roster', label: '레드팀 경기 명단', href: '/teams/t-1/games/g-1/roster' }]);

    const link = screen.getByRole('link', { name: '레드팀 경기 명단' });
    expect(link).toHaveAttribute('href', '/teams/t-1/games/g-1/roster');
    expect(screen.queryByRole('button', { name: /레드팀 경기 명단/ })).toBeNull();
  });

  it('icon 은 라벨 왼쪽에 그려지고 접근 이름을 바꾸지 않는다', () => {
    setup([{ key: 'a', label: '카카오맵', icon: <img src="/x.webp" alt="" data-testid="ic" />, onSelect: vi.fn() }]);
    const button = screen.getByRole('button', { name: '카카오맵' });
    expect(within(button).getByTestId('ic')).toBeInTheDocument();
  });

  it('externalHref 항목은 순수 링크이고 newTab 일 때만 새 탭 속성을 가지며 누르면 시트를 닫는다', () => {
    const { onClose } = setup([
      { key: 'a', label: '앱으로', externalHref: 'kakaomap://route?ep=1,2' },
      { key: 'b', label: '새 창으로', externalHref: 'https://map.kakao.com/', newTab: true },
    ]);
    const app = screen.getByRole('link', { name: '앱으로' });
    expect(app).toHaveAttribute('href', 'kakaomap://route?ep=1,2');
    expect(app).not.toHaveAttribute('target');
    expect(app).not.toHaveAttribute('rel');
    const web = screen.getByRole('link', { name: '새 창으로' });
    expect(web).toHaveAttribute('target', '_blank');
    expect(web).toHaveAttribute('rel', 'noopener noreferrer');
    fireEvent.click(app);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('같은 탭 외부 링크는 기본 이동을 막고 시트를 닫은 뒤 이동한다 — 새 탭 링크는 막지 않는다', async () => {
    const originalLocation = window.location;
    const assign = vi.fn();
    Object.defineProperty(window, 'location', { configurable: true, value: { ...originalLocation, assign } });
    try {
      const { onClose } = setup([
        { key: 'a', label: '앱으로', externalHref: 'kakaomap://route?ep=1,2' },
        { key: 'b', label: '새 창으로', externalHref: 'https://map.kakao.com/', newTab: true },
      ]);
      const notPrevented = fireEvent.click(screen.getByRole('link', { name: '앱으로' }));
      expect(notPrevented).toBe(false);
      expect(onClose).toHaveBeenCalledTimes(1);
      await vi.waitFor(() => expect(assign).toHaveBeenCalledWith('kakaomap://route?ep=1,2'));

      expect(fireEvent.click(screen.getByRole('link', { name: '새 창으로' }))).toBe(true);
      expect(assign).toHaveBeenCalledTimes(1);
    } finally {
      Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
    }
  });

  it('비활성 항목은 누를 수 없고 왜 못 누르는지를 설명 자리에 말한다', () => {
    const onSelect = vi.fn();
    setup([
      { key: 'end', label: '경기 종료', description: '경기를 마쳐요', disabled: true, disabledReason: '승부차기를 먼저 입력해 주세요.', onSelect },
    ]);

    const button = screen.getByRole('button', { name: /^경기 종료/ });
    expect(button).toBeDisabled();
    expect(button).toHaveTextContent('승부차기를 먼저 입력해 주세요.');
    expect(button).not.toHaveTextContent('경기를 마쳐요');
    fireEvent.click(button);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('닫기 버튼이 onClose 를 부른다', () => {
    const { onClose } = setup([{ key: 'a', label: '동작', onSelect: vi.fn() }]);

    fireEvent.click(screen.getByRole('button', { name: '닫기' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('열리면 aria-modal 다이얼로그이고 ESC 로 닫힌다', () => {
    const { onClose } = setup([{ key: 'a', label: '동작', onSelect: vi.fn() }]);

    expect(screen.getByRole('dialog', { name: '경기 더보기' })).toHaveAttribute('aria-modal', 'true');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Tab 이 시트 밖으로 새지 않는다 — 마지막에서 첫 컨트롤로, Shift+Tab 은 반대로 돈다', () => {
    setup([
      { key: 'a', label: '첫 동작', onSelect: vi.fn() },
      { key: 'b', label: '둘째 동작', onSelect: vi.fn() },
    ]);
    const dialog = screen.getByRole('dialog');
    const first = within(dialog).getByRole('button', { name: '닫기' });
    const last = within(dialog).getByRole('button', { name: /^둘째 동작/ });

    last.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(first);

    first.focus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it('배경을 누르면 닫히지만 시트 안을 누르면 닫히지 않는다', () => {
    const { onClose } = setup([{ key: 'a', label: '동작', onSelect: vi.fn() }]);

    fireEvent.click(screen.getByRole('dialog'));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('dialog').parentElement as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  describe('시트 안 링크는 뒤로가기 표식을 남기지 않는다', () => {
    it('다른 페이지로 가는 링크는 push 가 아니라 현재 항목을 갈아 끼워 이동한다', () => {
      const navigate = vi.fn();
      const unbind = bindSoftNavigator(navigate);
      setup([{ key: 'roster', label: '레드팀 경기 명단', href: '/teams/t-1/games/g-1/roster' }]);
      const pushesBefore = window.history.length;

      // 기본 동작(브라우저 push)이 막혀야 표식 항목이 새 페이지가 된다.
      const allowed = fireEvent.click(screen.getByRole('link', { name: '레드팀 경기 명단' }));

      expect(allowed).toBe(false);
      expect(navigate).toHaveBeenCalledWith('/teams/t-1/games/g-1/roster');
      expect(window.history.length).toBe(pushesBefore);
      unbind();
    });

    it('현재 페이지로 가는 링크는 이동 없이 시트만 닫는다', () => {
      nav.pathname = '/admin/live/l-1/operations';
      const navigate = vi.fn();
      const unbind = bindSoftNavigator(navigate);
      const { onClose } = setup([{ key: 'here', label: '운영 보드', href: '/admin/live/l-1/operations' }]);

      const allowed = fireEvent.click(screen.getByRole('link', { name: '운영 보드' }));

      expect(allowed).toBe(false);
      expect(navigate).not.toHaveBeenCalled();
      expect(onClose).toHaveBeenCalledTimes(1);
      unbind();
    });

    it('새 탭·수정키 클릭은 가로채지 않는다', () => {
      const navigate = vi.fn();
      const unbind = bindSoftNavigator(navigate);
      setup([{ key: 'roster', label: '레드팀 경기 명단', href: '/teams/t-1/games/g-1/roster' }]);

      // 시트가 가로채지 않았는지는 React 핸들러가 지난 뒤(document 버블)의 defaultPrevented 로 본다.
      // jsdom 은 실제 이동을 구현하지 않아 마지막에 스스로 막는다.
      let interceptedBySheet: boolean | null = null;
      document.addEventListener(
        'click',
        (event) => {
          interceptedBySheet = event.defaultPrevented;
          event.preventDefault();
        },
        { once: true },
      );
      fireEvent.click(screen.getByRole('link', { name: '레드팀 경기 명단' }), { metaKey: true });

      expect(interceptedBySheet).toBe(false);
      expect(navigate).not.toHaveBeenCalled();
      unbind();
    });
  });
});
