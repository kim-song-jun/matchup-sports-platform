import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useV1ExportRosterCsv } from '@/hooks/use-v1-api';
import { __resetOverlayHistoryForTests } from '@/lib/overlay-history';
import { handlersFixture, registrationFixture as reg, viewContextFixture } from '@/test/registration-fixtures';
import { installViewport } from '@/test/viewport';
import type { V1TournamentRegistrationStatus } from '@/types/api';
import { RegistrationRowMenu } from './registration-row-menu';

vi.mock('@/hooks/use-v1-api', () => ({ useV1ExportRosterCsv: vi.fn() }));
vi.mock('next/navigation', () => ({ usePathname: () => '/admin/tournaments/t-1' }));

const exportMutate = vi.fn();
let restoreViewport: () => void;

beforeEach(() => {
  restoreViewport = installViewport(1280);
  vi.mocked(useV1ExportRosterCsv).mockReturnValue({ mutate: exportMutate, isPending: false } as never);
});

afterEach(() => {
  cleanup();
  restoreViewport();
  __resetOverlayHistoryForTests();
  vi.clearAllMocks();
});

interface MenuCase {
  status: V1TournamentRegistrationStatus;
  canWrite: boolean;
  present: string[];
  absent: string[];
}

const MENU_TABLE: MenuCase[] = [
  { status: 'awaiting_payment', canWrite: true, present: ['명단 보기', '명단 CSV 받기', '신청 거부'], absent: ['대기로 두기', '경기별 명단'] },
  { status: 'waitlisted', canWrite: true, present: ['명단 보기', '명단 CSV 받기', '신청 거부'], absent: ['대기로 두기', '경기별 명단'] },
  { status: 'payment_checking', canWrite: true, present: ['대기로 두기', '명단 보기', '명단 CSV 받기', '신청 거부'], absent: ['경기별 명단'] },
  { status: 'paid', canWrite: true, present: ['대기로 두기', '명단 보기', '명단 CSV 받기', '신청 거부'], absent: ['경기별 명단'] },
  { status: 'confirmed', canWrite: true, present: ['경기별 명단', '명단 CSV 받기', '신청 거부'], absent: ['명단 보기', '대기로 두기'] },
  { status: 'cancel_requested', canWrite: true, present: ['명단 보기', '명단 CSV 받기'], absent: ['신청 거부', '대기로 두기', '경기별 명단'] },
  { status: 'submitted', canWrite: true, present: ['명단 CSV 받기'], absent: ['명단 보기', '신청 거부', '대기로 두기'] },
  { status: 'cancelled', canWrite: true, present: ['명단 CSV 받기'], absent: ['명단 보기', '신청 거부', '대기로 두기'] },
  { status: 'draft', canWrite: true, present: ['명단 CSV 받기'], absent: ['명단 보기', '신청 거부', '대기로 두기'] },
  // 조회 전용 — 주 버튼이 모두 「명단 보기」라 메뉴에는 중복해서 두지 않고, 변경 항목은 없다.
  { status: 'confirmed', canWrite: false, present: ['경기별 명단', '명단 CSV 받기'], absent: ['신청 거부', '명단 보기'] },
  { status: 'payment_checking', canWrite: false, present: ['명단 CSV 받기'], absent: ['대기로 두기', '신청 거부', '명단 보기'] },
  { status: 'awaiting_payment', canWrite: false, present: ['명단 CSV 받기'], absent: ['신청 거부', '명단 보기'] },
  { status: 'cancel_requested', canWrite: false, present: ['명단 CSV 받기'], absent: ['신청 거부', '명단 보기'] },
];

function openMenu(status: V1TournamentRegistrationStatus = 'confirmed', canWrite = true, ctxOverrides = {}) {
  const handlers = handlersFixture();
  render(
    <RegistrationRowMenu
      registration={reg({ status, teamName: '성수', playerCount: 7 })}
      ctx={viewContextFixture({ canWrite, ...ctxOverrides })}
      handlers={handlers}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: '성수 더보기' }));
  return handlers;
}

describe('RegistrationRowMenu — 데스크톱 팝오버', () => {
  it.each(MENU_TABLE)('$status · canWrite=$canWrite 의 메뉴 항목', ({ status, canWrite, present, absent }) => {
    openMenu(status, canWrite);
    const menu = screen.getByRole('menu', { name: '성수' });
    for (const label of present) expect(within(menu).getByRole('menuitem', { name: new RegExp(`^${label}`) })).toBeInTheDocument();
    for (const label of absent) expect(within(menu).queryByRole('menuitem', { name: new RegExp(`^${label}`) })).toBeNull();
  });

  it('신청 거부는 「되돌릴 수 없어요」 묶음에 빨강 항목으로 들어 있고, 고르면 그 신청으로 한 번 부르며 메뉴가 닫힌다', () => {
    const handlers = openMenu('confirmed');
    const menu = screen.getByRole('menu', { name: '성수' });
    expect(within(menu).getByRole('group', { name: '되돌릴 수 없어요' })).toBeInTheDocument();

    fireEvent.click(within(menu).getByRole('menuitem', { name: /^신청 거부/ }));
    expect(handlers.onReject).toHaveBeenCalledTimes(1);
    expect(handlers.onReject).toHaveBeenCalledWith(expect.objectContaining({ id: 'reg-1' }));
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('명단 CSV 받기는 그 신청의 CSV 훅을 한 번 부른다', () => {
    openMenu('submitted');
    fireEvent.click(screen.getByRole('menuitem', { name: /^명단 CSV 받기/ }));
    expect(useV1ExportRosterCsv).toHaveBeenCalledWith('reg-1');
    expect(exportMutate).toHaveBeenCalledTimes(1);
  });

  it('경기별 명단과 명단 보기 항목은 각자 핸들러로 이어진다', () => {
    const confirmed = openMenu('confirmed');
    fireEvent.click(screen.getByRole('menuitem', { name: /^경기별 명단/ }));
    expect(confirmed.onToggleGameRosters).toHaveBeenCalledWith(expect.objectContaining({ id: 'reg-1' }));
    cleanup();

    const waitlisted = openMenu('waitlisted');
    fireEvent.click(screen.getByRole('menuitem', { name: /^명단 보기/ }));
    expect(waitlisted.onViewRoster).toHaveBeenCalledWith(expect.objectContaining({ id: 'reg-1' }));
  });

  it('경기별 명단이 펼쳐진 행은 접기 항목으로 바뀐다', () => {
    const handlers = handlersFixture();
    render(
      <RegistrationRowMenu
        registration={reg({ status: 'confirmed', teamName: '성수' })}
        ctx={viewContextFixture()}
        handlers={handlers}
        gameRostersOpen
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '성수 더보기' }));
    expect(screen.getByRole('menuitem', { name: /^경기별 명단 접기/ })).toBeInTheDocument();
  });

  it('대기로 두기는 대회가 닫혀 있으면 비활성이고 눌러도 부르지 않는다', () => {
    const handlers = openMenu('payment_checking', true, { admissionsBlockedReason: '종료된 대회예요.' });
    const item = screen.getByRole('menuitem', { name: /^대기로 두기/ });
    expect(item).toBeDisabled();
    expect(item).toHaveTextContent('종료된 대회예요.');
    fireEvent.click(item);
    expect(handlers.onWaitlist).not.toHaveBeenCalled();
  });

  it('대기로 두기를 고르면 그 신청으로 부른다', () => {
    const handlers = openMenu('paid');
    fireEvent.click(screen.getByRole('menuitem', { name: /^대기로 두기/ }));
    expect(handlers.onWaitlist).toHaveBeenCalledWith(expect.objectContaining({ id: 'reg-1' }));
  });
});

describe('RegistrationRowMenu — 폰 시트', () => {
  beforeEach(() => {
    restoreViewport();
    restoreViewport = installViewport(390);
  });

  it('같은 항목이 시트 버튼으로 나오고, 머리에 팀과 상태·명단·잠금 한 줄이 있다', () => {
    openMenu('confirmed');
    const sheet = screen.getByRole('dialog', { name: '성수' });
    expect(within(sheet).getByText('참가 확정 · 명단 7명 · 잠금 전')).toBeInTheDocument();
    for (const label of ['경기별 명단', '명단 CSV 받기', '신청 거부']) {
      expect(within(sheet).getByRole('button', { name: new RegExp(`^${label}`) })).toBeInTheDocument();
    }
    expect(within(sheet).getByText('되돌릴 수 없어요')).toBeInTheDocument();
  });

  it('신청 거부를 고르면 시트를 닫고 핸들러를 부른다', () => {
    const handlers = openMenu('awaiting_payment');
    const sheet = screen.getByRole('dialog', { name: '성수' });
    fireEvent.click(within(sheet).getByRole('button', { name: /^신청 거부/ }));
    expect(handlers.onReject).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
