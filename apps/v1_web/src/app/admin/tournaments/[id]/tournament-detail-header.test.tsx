import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetOverlayHistoryForTests } from '@/lib/overlay-history';
import { installMatchMedia } from '@/test/match-media';
import type { V1TournamentStatus } from '@/types/api';
import { TournamentDetailHeader, type TournamentDetailHeaderProps } from './tournament-detail-header';
import { TournamentStatusMenu, type TournamentStatusMenuProps } from './tournament-status-menu';

vi.mock('next/navigation', () => ({ usePathname: () => '/admin/tournaments/tournament-1/overview' }));

let media: ReturnType<typeof installMatchMedia>;

beforeEach(() => {
  media = installMatchMedia(1024);
});

afterEach(() => {
  media.restore();
  __resetOverlayHistoryForTests();
});

const menuProps = (overrides: Partial<TournamentStatusMenuProps> = {}): TournamentStatusMenuProps => ({
  status: 'open',
  isPublic: true,
  canWrite: true,
  canRevertStart: false,
  visibilityPending: false,
  onStatusAction: vi.fn(),
  onToggleVisibility: vi.fn(),
  ...overrides,
});

const openMenu = (name: string | RegExp) => fireEvent.click(screen.getByRole('button', { name }));

describe('TournamentStatusMenu', () => {
  it('칩은 상태와 공개 여부를 글자로 말하고 누르면 메뉴가 열린다', () => {
    render(<TournamentStatusMenu {...menuProps()} />);
    const chip = screen.getByRole('button', { name: '접수 중 · 공개' });
    expect(chip).toHaveAttribute('aria-haspopup', 'menu');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();

    fireEvent.click(chip);

    expect(screen.getByRole('menu', { name: '대회 상태' })).toBeInTheDocument();
  });

  it('비공개 대회의 칩은 비공개라고 말한다', () => {
    render(<TournamentStatusMenu {...menuProps({ isPublic: false })} />);
    expect(screen.getByRole('button', { name: '접수 중 · 비공개' })).toBeInTheDocument();
  });

  it('메뉴 맨 위에 현재 단계가 진행 막대로 보인다', () => {
    render(<TournamentStatusMenu {...menuProps()} />);
    openMenu(/접수 중/);

    const menu = screen.getByRole('menu', { name: '대회 상태' });
    expect(within(menu).getByText('지금: 접수 중')).toBeInTheDocument();
    const steps = within(within(menu).getByRole('list', { name: '진행 단계' })).getAllByRole('listitem');
    expect(steps.map((step) => step.textContent)).toEqual(['초안', '접수 중', '접수 마감', '진행 중', '완료']);
    expect(steps.map((step) => step.getAttribute('aria-current'))).toEqual([null, 'step', null, null, null]);
  });

  it('취소됨 칩은 공개 여부 글자와 진행 막대가 없다', () => {
    render(<TournamentStatusMenu {...menuProps({ status: 'cancelled' })} />);
    const chip = screen.getByRole('button', { name: '취소됨' });
    expect(chip).not.toHaveTextContent('공개');

    fireEvent.click(chip);

    const menu = screen.getByRole('menu', { name: '대회 상태' });
    expect(within(menu).getByText('지금: 취소됨')).toBeInTheDocument();
    expect(within(menu).queryByRole('list', { name: '진행 단계' })).not.toBeInTheDocument();
    // 취소된 대회는 공개 스위치가 없고 복구만 남는다.
    expect(within(menu).queryByRole('menuitemcheckbox')).not.toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: /초안으로 복구/ })).toBeInTheDocument();
  });

  it('쓰기 권한이 있으면 상태 바꾸기·공개·되돌리기 어려운 동작 세 묶음이 순서대로 있다', () => {
    render(<TournamentStatusMenu {...menuProps({ status: 'closed' })} />);
    openMenu(/접수 마감/);

    const menu = screen.getByRole('menu', { name: '대회 상태' });
    expect(within(menu).getAllByRole('group').map((group) => group.getAttribute('aria-label'))).toEqual([
      '상태 바꾸기',
      '공개',
      '되돌리기 어려운 동작',
    ]);
    expect(within(menu).getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      '대회 시작하기대진표와 경기 일정을 먼저 확인해 주세요.',
      '접수 다시 열기새 신청을 다시 받아요.',
      '대회 취소하기취소 사유를 남겨요. 나중에 초안으로 복구할 수 있어요.',
    ]);
  });

  it('canWrite=false 면 상태 바꾸기·대회 취소 항목이 없고 공개 스위치는 비활성이다', () => {
    render(<TournamentStatusMenu {...menuProps({ canWrite: false })} />);
    openMenu(/접수 중/);

    const menu = screen.getByRole('menu', { name: '대회 상태' });
    expect(within(menu).queryByRole('menuitem')).not.toBeInTheDocument();
    const visibility = within(menu).getByRole('menuitemcheckbox', { name: /참가자에게 공개/ });
    expect(visibility).toBeDisabled();
    expect(visibility).toHaveAttribute('aria-checked', 'true');
    expect(within(menu).getByText('현재 계정은 공개 상태를 변경할 권한이 없어요.')).toBeInTheDocument();
  });

  it('항목을 고르면 onStatusAction 에 그 동작이 전달되고 메뉴가 닫힌다', () => {
    const onStatusAction = vi.fn();
    render(<TournamentStatusMenu {...menuProps({ status: 'closed', onStatusAction })} />);

    openMenu(/접수 마감/);
    fireEvent.click(screen.getByRole('menuitem', { name: /접수 다시 열기/ }));
    expect(onStatusAction).toHaveBeenLastCalledWith(expect.objectContaining({ kind: 'reopen', target: 'open' }));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();

    openMenu(/접수 마감/);
    fireEvent.click(screen.getByRole('menuitem', { name: /대회 취소하기/ }));
    expect(onStatusAction).toHaveBeenLastCalledWith(expect.objectContaining({ kind: 'cancel', target: 'cancelled' }));
    expect(onStatusAction).toHaveBeenCalledTimes(2);
  });

  it('공개 스위치를 고르면 반대 값을 넘기고, 변경 중이면 잠긴다', () => {
    const onToggleVisibility = vi.fn();
    const { unmount } = render(<TournamentStatusMenu {...menuProps({ onToggleVisibility })} />);
    openMenu(/접수 중/);
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: /참가자에게 공개/ }));
    expect(onToggleVisibility).toHaveBeenCalledWith(false);
    unmount();

    render(<TournamentStatusMenu {...menuProps({ visibilityPending: true, onToggleVisibility })} />);
    openMenu(/접수 중/);
    expect(screen.getByRole('menuitemcheckbox', { name: /참가자에게 공개/ })).toBeDisabled();
    expect(screen.getByText('저장 중이에요.')).toBeInTheDocument();
  });

  it('상태를 바꾸는 중이면 상태 바꾸기·취소 항목이 잠긴다', () => {
    render(<TournamentStatusMenu {...menuProps({ statusPending: true })} />);
    openMenu(/접수 중/);
    const menu = screen.getByRole('menu', { name: '대회 상태' });
    for (const item of within(menu).getAllByRole('menuitem')) expect(item).toBeDisabled();
  });

  it('열 항목이 하나도 없으면(조회 전용 관리자의 취소된 대회) 버튼 없이 상태만 보인다', () => {
    render(<TournamentStatusMenu {...menuProps({ status: 'cancelled', canWrite: false })} />);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText('취소됨')).toBeInTheDocument();
  });

  it('폰 폭에서는 같은 메뉴가 dialog 시트로 열리고 진행 막대가 보인다', () => {
    media.setWidth(390);
    render(<TournamentStatusMenu {...menuProps({ status: 'completed' as V1TournamentStatus })} />);
    openMenu(/완료/);

    const sheet = screen.getByRole('dialog', { name: '대회 상태' });
    expect(within(sheet).getByRole('list', { name: '진행 단계' })).toBeInTheDocument();
    expect(within(sheet).getByRole('button', { name: /진행 중으로 되돌리기/ })).toBeInTheDocument();
  });
});

const headerProps = (overrides: Partial<TournamentDetailHeaderProps> = {}): TournamentDetailHeaderProps => ({
  title: '서울 풋살 챔피언십',
  meta: '서울 풋살장 · 2026. 12. 20. · 8팀',
  listHref: '/admin/tournaments',
  statusMenu: <span data-testid="status-menu">칩</span>,
  moreActions: [],
  ...overrides,
});

describe('TournamentDetailHeader', () => {
  it('뒤로 링크·대회명(h1)·상태 칩 자리·meta 한 줄을 그린다', () => {
    render(<TournamentDetailHeader {...headerProps()} />);

    expect(screen.getByRole('link', { name: '대회 목록으로' })).toHaveAttribute('href', '/admin/tournaments');
    expect(screen.getByRole('heading', { level: 1, name: '서울 풋살 챔피언십' })).toBeInTheDocument();
    expect(screen.getByTestId('status-menu')).toBeInTheDocument();
    expect(screen.getByText('서울 풋살장 · 2026. 12. 20. · 8팀')).toBeInTheDocument();
  });

  it('현장 운영은 liveOps 가 있을 때만 머리에 있고, reasonLabel 이 있으면 비활성이며 사유가 보인다', () => {
    const { rerender } = render(<TournamentDetailHeader {...headerProps()} />);
    expect(screen.queryByText('현장 운영')).not.toBeInTheDocument();

    rerender(<TournamentDetailHeader {...headerProps({ liveOps: { href: '/admin/live/tournament-1/operations' } })} />);
    expect(screen.getByRole('link', { name: /현장 운영/ })).toHaveAttribute('href', '/admin/live/tournament-1/operations');

    rerender(
      <TournamentDetailHeader
        {...headerProps({ liveOps: { href: '/admin/live/tournament-1/operations', reasonLabel: '스태프 배정이 필요해요' } })}
      />,
    );
    expect(screen.queryByRole('link', { name: /현장 운영/ })).not.toBeInTheDocument();
    const disabled = screen.getByRole('button', { name: /현장 운영/ });
    expect(disabled).toBeDisabled();
    expect(disabled).toHaveTextContent('스태프 배정이 필요해요');
  });

  it('주 버튼은 emphasis 에 따라 primary/outline 클래스를 가지고 없으면 그리지 않는다', () => {
    const onClick = vi.fn();
    const { rerender } = render(<TournamentDetailHeader {...headerProps()} />);
    expect(screen.queryByRole('button', { name: '접수 시작하기' })).not.toBeInTheDocument();

    rerender(<TournamentDetailHeader {...headerProps({ primaryAction: { label: '접수 시작하기', emphasis: 'primary', busy: false, onClick } })} />);
    const primary = screen.getByRole('button', { name: '접수 시작하기' });
    expect(primary.className).toContain('tm-btn-primary');
    expect(primary.className).not.toContain('tm-btn-outline');
    fireEvent.click(primary);
    expect(onClick).toHaveBeenCalledTimes(1);

    rerender(<TournamentDetailHeader {...headerProps({ primaryAction: { label: '접수 시작하기', emphasis: 'secondary', busy: false, onClick } })} />);
    expect(screen.getByRole('button', { name: '접수 시작하기' }).className).toContain('tm-btn-outline');

    rerender(<TournamentDetailHeader {...headerProps({ primaryAction: { label: '접수 시작하기', emphasis: 'primary', busy: true, onClick } })} />);
    expect(screen.getByRole('button', { name: '접수 시작하기' })).toBeDisabled();
  });

  it('moreActions 가 비면 ⋯ 가 없고 있으면 메뉴 항목이 열린다', () => {
    const { rerender } = render(<TournamentDetailHeader {...headerProps()} />);
    expect(screen.queryByRole('button', { name: '대회 더 보기' })).not.toBeInTheDocument();

    rerender(
      <TournamentDetailHeader
        {...headerProps({ moreActions: [{ key: 'staff', label: '스태프 배정', href: '/admin/live/tournament-1/staff' }] })}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '대회 더 보기' }));

    const menu = screen.getByRole('menu', { name: '대회 더 보기' });
    expect(within(menu).getByRole('menuitem', { name: '스태프 배정' })).toHaveAttribute('href', '/admin/live/tournament-1/staff');
  });

  // jsdom 에는 레이아웃이 없다 — 데스크톱 한 줄에서 오른쪽 묶음을 끝으로 미는 자동 여백(`lg:ml-auto`)이
  // 오른쪽 묶음의 첫 컨트롤 하나에만 있는지로 ⋯ 가 어떤 조합에서도 오른쪽 끝에 서는지 본다.
  describe('오른쪽 묶음 정렬', () => {
    const MORE = [{ key: 'staff', label: '스태프 배정', href: '/admin/live/tournament-1/staff' }];
    const LIVE_OPS = { href: '/admin/live/tournament-1/operations' };
    const PRIMARY = { label: '접수 마감하기', emphasis: 'primary' as const, busy: false, onClick: vi.fn() };

    const pushedRight = (container: HTMLElement) => container.querySelectorAll('[class*="lg:ml-auto"]');

    it.each([
      ['현장 운영·주 버튼 없음(조회 전용·취소됨)', {}, () => screen.getByRole('button', { name: '대회 더 보기' })],
      ['주 버튼만', { primaryAction: PRIMARY }, () => screen.getByRole('button', { name: '접수 마감하기' })],
      ['현장 운영만', { liveOps: LIVE_OPS }, () => screen.getByRole('link', { name: /현장 운영/ })],
      ['현장 운영 비활성(사유)만', { liveOps: { ...LIVE_OPS, reasonLabel: '스태프 배정이 필요해요.' } }, () => screen.getByRole('button', { name: /현장 운영/ })],
      ['현장 운영·주 버튼 모두', { liveOps: LIVE_OPS, primaryAction: PRIMARY }, () => screen.getByRole('link', { name: /현장 운영/ })],
    ] as [string, Partial<TournamentDetailHeaderProps>, () => HTMLElement][])(
      '%s — 자동 여백은 오른쪽 묶음의 첫 컨트롤에 하나만 있다',
      (_name, overrides, firstControl) => {
        const { container } = render(<TournamentDetailHeader {...headerProps({ moreActions: MORE, ...overrides })} />);

        const pushed = pushedRight(container);
        expect(pushed).toHaveLength(1);
        expect(pushed[0].contains(firstControl())).toBe(true);
      },
    );

    it('⋯ 가 없고 주 버튼도 없으면 밀어낼 컨트롤이 없다', () => {
      const { container } = render(<TournamentDetailHeader {...headerProps()} />);
      expect(pushedRight(container)).toHaveLength(0);
    });
  });
});
