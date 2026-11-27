import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetOverlayHistoryForTests } from '@/lib/overlay-history';
import { installMatchMedia } from '@/test/match-media';
import { ActionMenu, type ActionMenuProps } from './action-menu';
import { useConfirm } from './confirm-modal';

vi.mock('next/navigation', () => ({ usePathname: () => '/admin/tournaments/t-1' }));

let media: ReturnType<typeof installMatchMedia>;

afterEach(() => {
  media?.restore();
  __resetOverlayHistoryForTests();
});

const trigger: ActionMenuProps['trigger'] = ({ onToggle, ...aria }) => (
  <button type="button" {...aria} onClick={onToggle}>
    상태
  </button>
);

function renderMenu(props: Partial<ActionMenuProps> & Pick<ActionMenuProps, 'actions'>) {
  return render(<ActionMenu label="대회 상태" trigger={trigger} {...props} />);
}

function ConfirmingMenu({ onSelect }: { onSelect?: () => void }) {
  const { confirm, ConfirmModal } = useConfirm();
  return (
    <>
      <ActionMenu
        label="대회 상태"
        trigger={trigger}
        actions={[
          {
            key: 'close',
            label: '접수 마감',
            onSelect: () => {
              onSelect?.();
              void confirm({ title: '접수를 마감할까요?', message: '신청을 더 받을 수 없어요.' });
            },
          },
        ]}
      />
      {ConfirmModal}
    </>
  );
}

describe('ActionMenu 폰', () => {
  beforeEach(() => {
    media = installMatchMedia(390);
  });

  it('트리거는 aria-expanded 로 열림을 말하고 누를 때마다 토글한다', () => {
    renderMenu({ actions: [{ key: 'a', label: '접수 마감', onSelect: vi.fn() }] });
    const button = screen.getByRole('button', { name: '상태' });

    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(button).toHaveAttribute('aria-haspopup', 'menu');
    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'false');
  });

  it('폰에서는 label 이 제목인 dialog(기존 ActionSheet)로 열리고 같은 항목을 가진다', () => {
    renderMenu({
      actions: [
        { key: 'a', label: '접수 마감', description: '신청을 막아요', onSelect: vi.fn() },
        { key: 'b', label: '대진 보기', href: '/admin/tournaments/t-1/bracket' },
      ],
    });
    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '상태' }));

    const dialog = screen.getByRole('dialog', { name: '대회 상태' });
    expect(within(dialog).getByRole('button', { name: /^접수 마감/ })).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: '대진 보기' })).toHaveAttribute('href', '/admin/tournaments/t-1/bracket');
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('subtitle 은 시트 제목 아래에 보인다', () => {
    renderMenu({ subtitle: '접수 중 · 12팀', actions: [{ key: 'a', label: '접수 마감', onSelect: vi.fn() }] });
    fireEvent.click(screen.getByRole('button', { name: '상태' }));

    const dialog = screen.getByRole('dialog', { name: '대회 상태' });
    const title = within(dialog).getByRole('heading', { name: '대회 상태' });
    const subtitle = within(dialog).getByText('접수 중 · 12팀');
    expect(title.compareDocumentPosition(subtitle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('header 가 시트 안에 보인다', () => {
    renderMenu({ header: <div>진행 3/8</div>, actions: [{ key: 'a', label: '접수 마감', onSelect: vi.fn() }] });
    fireEvent.click(screen.getByRole('button', { name: '상태' }));

    expect(within(screen.getByRole('dialog', { name: '대회 상태' })).getByText('진행 3/8')).toBeInTheDocument();
  });

  it('항목을 고르면 시트가 닫히고 onSelect 가 한 번 불린다', () => {
    const onSelect = vi.fn();
    renderMenu({ actions: [{ key: 'a', label: '접수 마감', onSelect }] });
    fireEvent.click(screen.getByRole('button', { name: '상태' }));

    fireEvent.click(screen.getByRole('button', { name: '접수 마감' }));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('button', { name: '상태' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('고른 동작이 useConfirm 창을 띄워도 시트와 확인 창이 함께 보이지 않는다', async () => {
    render(<ConfirmingMenu />);
    fireEvent.click(screen.getByRole('button', { name: '상태' }));

    fireEvent.click(screen.getByRole('button', { name: '접수 마감' }));

    expect(await screen.findByRole('dialog', { name: '접수를 마감할까요?' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: '대회 상태' })).toBeNull();
  });

  it('href·externalHref·destructive 항목은 ActionSheet 규칙 그대로 그린다', () => {
    renderMenu({
      actions: [
        { key: 'a', label: '대진 보기', href: '/admin/tournaments/t-1/bracket' },
        { key: 'b', label: '공개 화면', externalHref: 'https://example.com/t/1', newTab: true },
        { key: 'c', label: '대회 취소', destructive: true, onSelect: vi.fn() },
      ],
    });
    fireEvent.click(screen.getByRole('button', { name: '상태' }));

    expect(screen.getByRole('link', { name: '대진 보기' })).toHaveAttribute('href', '/admin/tournaments/t-1/bracket');
    const external = screen.getByRole('link', { name: '공개 화면' });
    expect(external).toHaveAttribute('target', '_blank');
    expect(external).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.getByText('대회 취소').className).toContain('text-[var(--red700)]');
  });

  it('열린 채 폭이 768 이상이 되면 시트를 닫는다', () => {
    renderMenu({ actions: [{ key: 'a', label: '접수 마감', onSelect: vi.fn() }] });
    fireEvent.click(screen.getByRole('button', { name: '상태' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    media.setWidth(1024);

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('menu')).toBeNull();
    expect(screen.getByRole('button', { name: '상태' })).toHaveAttribute('aria-expanded', 'false');

    // 닫힌 채 폭이 되돌아와도 저절로 다시 열리지 않는다.
    media.setWidth(390);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('항목이 하나도 없으면 토글해도 아무것도 열리지 않는다', () => {
    renderMenu({ actions: [] });
    const button = screen.getByRole('button', { name: '상태' });

    fireEvent.click(button);

    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('menu')).toBeNull();
  });
});

describe('ActionMenu 데스크톱', () => {
  beforeEach(() => {
    media = installMatchMedia(1024);
  });

  const openMenu = () => {
    fireEvent.click(screen.getByRole('button', { name: '상태' }));
    return screen.getByRole('menu', { name: '대회 상태' });
  };
  const focusedLabel = () => document.activeElement?.textContent;

  it('트리거 아래 role=menu 로 열리고 label 이 이름이며 항목은 menuitem 이다', () => {
    renderMenu({
      actions: [
        { key: 'a', label: '접수 마감', onSelect: vi.fn() },
        { key: 'b', label: '대회 취소', destructive: true, onSelect: vi.fn() },
      ],
    });
    expect(screen.queryByRole('menu')).toBeNull();

    const menu = openMenu();

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(within(menu).getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['접수 마감', '대회 취소']);
    expect(screen.getByRole('button', { name: '상태' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('팝오버는 document.body 직속 포털이라 overflow 조상 안에 갇히지 않는다', () => {
    const { container } = render(
      <div style={{ overflowX: 'auto' }}>
        <ActionMenu label="대회 상태" trigger={trigger} actions={[{ key: 'a', label: '접수 마감', onSelect: vi.fn() }]} />
      </div>,
    );

    const menu = openMenu();

    expect(container.contains(menu)).toBe(false);
    expect(menu.parentElement).toBe(document.body);
    expect(menu.style.position).toBe('fixed');
  });

  it('열면 첫 활성 항목에 포커스가 가고 ArrowDown/ArrowUp/Home/End 가 비활성 항목을 건너뛰며 돈다', () => {
    renderMenu({
      actions: [
        { key: 'a', label: '첫째', onSelect: vi.fn() },
        { key: 'b', label: '둘째', disabled: true, onSelect: vi.fn() },
        { key: 'c', label: '셋째', onSelect: vi.fn() },
      ],
    });
    const menu = openMenu();
    expect(focusedLabel()).toBe('첫째');

    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(focusedLabel()).toBe('셋째');
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(focusedLabel()).toBe('첫째');
    fireEvent.keyDown(menu, { key: 'ArrowUp' });
    expect(focusedLabel()).toBe('셋째');
    fireEvent.keyDown(menu, { key: 'Home' });
    expect(focusedLabel()).toBe('첫째');
    fireEvent.keyDown(menu, { key: 'End' });
    expect(focusedLabel()).toBe('셋째');
  });

  it('첫 항목이 비활성이면 그 다음 활성 항목에 포커스가 간다', () => {
    renderMenu({
      actions: [
        { key: 'a', label: '첫째', disabled: true, onSelect: vi.fn() },
        { key: 'b', label: '둘째', onSelect: vi.fn() },
      ],
    });
    openMenu();

    expect(focusedLabel()).toBe('둘째');
  });

  it('ESC 는 메뉴만 닫고 포커스를 트리거로 돌린다', () => {
    renderMenu({ actions: [{ key: 'a', label: '접수 마감', onSelect: vi.fn() }] });
    openMenu();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '상태' }));
  });

  it('Tab 은 메뉴를 닫고 포커스가 트리거에 있다', () => {
    renderMenu({ actions: [{ key: 'a', label: '접수 마감', onSelect: vi.fn() }] });
    const menu = openMenu();

    fireEvent.keyDown(menu, { key: 'Tab' });

    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '상태' }));
  });

  it('바깥을 누르면 닫히고 트리거를 다시 누르면 토글로 닫힌다(다시 열리지 않는다)', () => {
    renderMenu({ actions: [{ key: 'a', label: '접수 마감', onSelect: vi.fn() }] });
    const button = screen.getByRole('button', { name: '상태' });
    openMenu();

    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('menu')).toBeNull();

    openMenu();
    fireEvent.pointerDown(button);
    fireEvent.click(button);
    expect(screen.queryByRole('menu')).toBeNull();
    expect(button).toHaveAttribute('aria-expanded', 'false');
  });

  it('메뉴 안을 누르는 것은 바깥 클릭이 아니다', () => {
    renderMenu({ actions: [{ key: 'a', label: '접수 마감', disabled: true, disabledReason: '이미 마감했어요.', onSelect: vi.fn() }] });
    const menu = openMenu();

    fireEvent.pointerDown(within(menu).getByText('접수 마감'));

    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  it('다른 곳을 스크롤하거나 창 크기가 바뀌면 닫히고 메뉴 안 스크롤은 닫지 않는다', () => {
    render(
      <>
        <div data-testid="page-scroll" />
        <ActionMenu label="대회 상태" trigger={trigger} actions={[{ key: 'a', label: '접수 마감', onSelect: vi.fn() }]} />
      </>,
    );

    const menu = openMenu();
    fireEvent.scroll(menu);
    expect(screen.getByRole('menu')).toBeInTheDocument();

    fireEvent.scroll(screen.getByTestId('page-scroll'));
    expect(screen.queryByRole('menu')).toBeNull();

    openMenu();
    fireEvent(window, new Event('resize'));
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('항목을 고르면 메뉴가 닫히고 포커스가 트리거로 돌아간 뒤 onSelect 가 불린다', () => {
    let focusedWhenSelected: Element | null = null;
    const onSelect = vi.fn(() => {
      focusedWhenSelected = document.activeElement;
    });
    renderMenu({ actions: [{ key: 'a', label: '접수 마감', onSelect }] });
    openMenu();

    fireEvent.click(screen.getByRole('menuitem', { name: '접수 마감' }));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(focusedWhenSelected).toBe(screen.getByRole('button', { name: '상태' }));
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('고른 동작이 useConfirm 창을 띄워도 메뉴와 확인 창이 함께 보이지 않는다', async () => {
    render(<ConfirmingMenu />);
    openMenu();

    fireEvent.click(screen.getByRole('menuitem', { name: '접수 마감' }));

    const confirmDialog = await screen.findByRole('dialog', { name: '접수를 마감할까요?' });
    expect(screen.queryByRole('menu')).toBeNull();

    fireEvent.click(within(confirmDialog).getByRole('button', { name: '취소' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '상태' }));
  });

  it('비활성 항목은 눌러도 onSelect 가 불리지 않고 disabledReason 이 보인다', () => {
    const onSelect = vi.fn();
    renderMenu({
      actions: [
        { key: 'a', label: '접수 마감', description: '신청을 막아요', disabled: true, disabledReason: '이미 마감했어요.', onSelect },
      ],
    });
    const menu = openMenu();

    const item = within(menu).getByRole('menuitem', { name: /^접수 마감/ });
    expect(item).toBeDisabled();
    expect(item).toHaveTextContent('이미 마감했어요.');
    expect(item).not.toHaveTextContent('신청을 막아요');
    fireEvent.click(item);
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  it('groupLabel 이 바뀌는 곳마다 묶음 제목을 한 번만 그린다', () => {
    renderMenu({
      actions: [
        { key: 'a', label: '접수 마감', groupLabel: '상태 바꾸기', onSelect: vi.fn() },
        { key: 'b', label: '진행 시작', groupLabel: '상태 바꾸기', onSelect: vi.fn() },
        { key: 'c', label: '참가자에게 공개', groupLabel: '공개', onSelect: vi.fn() },
      ],
    });
    const menu = openMenu();

    expect(within(menu).getAllByRole('group').map((group) => group.getAttribute('aria-label'))).toEqual(['상태 바꾸기', '공개']);
    expect(within(menu).getAllByText('상태 바꾸기')).toHaveLength(1);
    expect(within(menu).getAllByText('공개')).toHaveLength(1);
    const [first, second] = within(menu).getAllByRole('group');
    expect(within(first).getAllByRole('menuitem')).toHaveLength(2);
    expect(within(second).getAllByRole('menuitem')).toHaveLength(1);
  });

  it('checked 항목은 menuitemcheckbox 이고 aria-checked 가 상태를 말한다', () => {
    const onSelect = vi.fn();
    renderMenu({
      actions: [
        { key: 'a', label: '참가자에게 공개', checked: true, onSelect },
        { key: 'b', label: '순위 공개', checked: false, onSelect: vi.fn() },
      ],
    });
    const menu = openMenu();

    expect(within(menu).getByRole('menuitemcheckbox', { name: '참가자에게 공개' })).toHaveAttribute('aria-checked', 'true');
    expect(within(menu).getByRole('menuitemcheckbox', { name: '순위 공개' })).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(within(menu).getByRole('menuitemcheckbox', { name: '참가자에게 공개' }));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('header 가 항목 위에 보인다', () => {
    renderMenu({ header: <div>진행 3/8</div>, actions: [{ key: 'a', label: '접수 마감', onSelect: vi.fn() }] });
    const menu = openMenu();

    const head = within(menu).getByText('진행 3/8');
    const item = within(menu).getByRole('menuitem', { name: '접수 마감' });
    expect(head.compareDocumentPosition(item) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('subtitle 이 있으면 label 과 함께 머리에 보이고 menu 의 설명이 된다', () => {
    renderMenu({ subtitle: '접수 중 · 12팀', actions: [{ key: 'a', label: '접수 마감', onSelect: vi.fn() }] });
    const menu = openMenu();

    expect(within(menu).getByText('대회 상태')).toBeInTheDocument();
    expect(within(menu).getByText('접수 중 · 12팀')).toBeInTheDocument();
    expect(menu).toHaveAccessibleDescription('접수 중 · 12팀');
  });

  it('subtitle 이 없으면 머리 글자가 없고 이름만 aria-label 로 남는다', () => {
    renderMenu({ actions: [{ key: 'a', label: '접수 마감', onSelect: vi.fn() }] });
    const menu = openMenu();

    expect(within(menu).queryByText('대회 상태')).toBeNull();
    expect(menu).not.toHaveAttribute('aria-describedby');
  });

  it('align=end 는 오른쪽 기준, start 는 왼쪽 기준으로 놓는다', () => {
    const actions = [{ key: 'a', label: '접수 마감', onSelect: vi.fn() }];
    const { unmount } = renderMenu({ actions, align: 'end' });
    const endMenu = openMenu();
    expect(endMenu.style.right).not.toBe('');
    expect(endMenu.style.left).toBe('');
    unmount();

    renderMenu({ actions, align: 'start' });
    const startMenu = openMenu();
    expect(startMenu.style.left).not.toBe('');
    expect(startMenu.style.right).toBe('');
  });

  it('트리거 아래 공간이 모자라면 위로 열고, 충분하면 아래로 연다', () => {
    const rect = vi.spyOn(Element.prototype, 'getBoundingClientRect');
    try {
      renderMenu({ actions: [{ key: 'a', label: '접수 마감', onSelect: vi.fn() }] });
      const bottom = window.innerHeight - 10;
      rect.mockReturnValue({ top: bottom - 32, bottom, left: 100, right: 140, width: 40, height: 32, x: 100, y: bottom - 32, toJSON: () => ({}) });
      const nearBottom = openMenu();
      expect(nearBottom.style.bottom).toBe(`${window.innerHeight - (bottom - 32) + 8}px`);
      expect(nearBottom.style.top).toBe('');

      fireEvent.keyDown(document, { key: 'Escape' });
      rect.mockReturnValue({ top: 40, bottom: 72, left: 100, right: 140, width: 40, height: 32, x: 100, y: 40, toJSON: () => ({}) });
      const nearTop = openMenu();
      expect(nearTop.style.top).toBe('80px');
      expect(nearTop.style.bottom).toBe('');
    } finally {
      rect.mockRestore();
    }
  });

  it('href 항목은 menuitem 링크이고 누르면 메뉴가 닫힌다', () => {
    renderMenu({ actions: [{ key: 'a', label: '대진 보기', href: '/admin/tournaments/t-1/bracket' }] });
    const menu = openMenu();

    const link = within(menu).getByRole('menuitem', { name: '대진 보기' });
    expect(link).toHaveAttribute('href', '/admin/tournaments/t-1/bracket');
    // jsdom 은 실제 이동을 구현하지 않는다 — React 핸들러가 지난 뒤 기본 동작만 막는다.
    document.addEventListener('click', (event) => event.preventDefault(), { once: true });
    fireEvent.click(link, { metaKey: true });

    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('externalHref 항목은 menuitem 링크이고 newTab 일 때만 새 탭 속성을 가진다', () => {
    renderMenu({
      actions: [
        { key: 'a', label: '앱으로', externalHref: 'kakaomap://route?ep=1,2' },
        { key: 'b', label: '새 창으로', externalHref: 'https://map.kakao.com/', newTab: true },
      ],
    });
    const menu = openMenu();

    expect(within(menu).getByRole('menuitem', { name: '앱으로' })).not.toHaveAttribute('target');
    const web = within(menu).getByRole('menuitem', { name: '새 창으로' });
    expect(web).toHaveAttribute('target', '_blank');
    expect(web).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('폭이 768 미만으로 줄면 열려 있던 메뉴를 닫는다', () => {
    renderMenu({ actions: [{ key: 'a', label: '접수 마감', onSelect: vi.fn() }] });
    openMenu();

    media.setWidth(390);

    expect(screen.queryByRole('menu')).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
