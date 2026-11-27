import { fireEvent, render, screen, within } from '@testing-library/react';
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
