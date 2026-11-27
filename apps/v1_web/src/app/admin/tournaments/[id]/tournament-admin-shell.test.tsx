/**
 * tournament-admin-shell.test.tsx
 *
 * 대회 상세 셸의 계약: 머리 한 줄(뒤로 · 대회명 · 상태 칩 · 현장 운영 · 주 버튼 · ⋯), 가로 탭 + 더보기,
 * 모든 상태 전환의 앱 확인 창, 권한·면(플랫폼/스태프/공개 샘플)별로 달라지는 항목.
 * 대회별 팝업 화면은 없고 전역 팝업 하나라서, 더보기의 「팝업」은 경로를 프리필한 전역 화면 링크여야 한다.
 */
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { V1ApiError } from '@/lib/api-client';
import { tournamentOpsAccessDeniedLabel } from '@/lib/tournament-ops-access';
import { __resetOverlayHistoryForTests } from '@/lib/overlay-history';
import { installMatchMedia } from '@/test/match-media';
import { TournamentAdminShell, TournamentManagementContent } from './tournament-admin-shell';

const h = vi.hoisted(() => ({
  adminRole: 'ops' as 'owner' | 'ops' | 'support',
  tournament: {} as Record<string, unknown>,
  statusPending: false,
  visibilityPending: false,
  staff: {} as Record<string, unknown>,
  pathname: '/admin/tournaments/tournament-1/overview',
  statusMutate: vi.fn(),
  visibilityMutate: vi.fn(),
}));

vi.mock('next/navigation', () => ({ usePathname: () => h.pathname }));

vi.mock('@/hooks/use-v1-api', () => ({
  useV1AdminTournament: () => ({ data: h.tournament, isPending: false, isError: false, error: null, refetch: vi.fn() }),
  useV1AdminMe: () => ({ data: { capabilities: ['status:write'], adminRole: h.adminRole } }),
  useV1ChangeTournamentStatus: () => ({ mutate: h.statusMutate, isPending: h.statusPending }),
  useV1UpdateTournamentVisibility: () => ({ mutate: h.visibilityMutate, isPending: h.visibilityPending }),
  useV1TournamentStaffAssignments: () => h.staff,
}));

const FILLED = {
  id: 'tournament-1',
  title: '서울 풋살 챔피언십',
  status: 'open',
  canRevertStart: false,
  isPublic: true,
  venue: '서울 풋살장',
  scheduledAt: '2026-12-20T09:00:00+09:00',
  scheduledEndAt: null,
  registrationDeadlineAt: '2026-12-17T23:59:00+09:00',
  rosterDeadlineAt: '2026-12-18T23:59:00+09:00',
  entryFee: 0,
  bankAccount: null,
  teamCount: 8,
  sport: { code: 'futsal', name: '풋살' },
  operationCounts: { registrations: 3, fixtures: 4, announcements: 1 },
};

const setTournament = (overrides: Record<string, unknown> = {}) => {
  h.tournament = { ...FILLED, ...overrides };
};

const CHIP_NAME: Record<string, string> = {
  draft: '초안',
  open: '접수 중',
  closed: '접수 마감',
  in_progress: '진행 중',
  completed: '완료',
  cancelled: '취소됨',
};

let media: ReturnType<typeof installMatchMedia>;

beforeEach(() => {
  media = installMatchMedia(390);
  h.adminRole = 'ops';
  h.statusPending = false;
  h.visibilityPending = false;
  h.pathname = '/admin/tournaments/tournament-1/overview';
  h.staff = { data: { items: [] }, isPending: false, isError: false, error: null };
  h.statusMutate.mockReset();
  h.visibilityMutate.mockReset();
  setTournament();
});

afterEach(() => {
  media.restore();
  __resetOverlayHistoryForTests();
});

const renderPlatform = () =>
  render(
    <TournamentAdminShell id="tournament-1">
      <div>섹션 본문</div>
    </TournamentAdminShell>,
  );

const renderStaff = () =>
  render(
    <TournamentManagementContent id="tournament-1" role="TOURNAMENT_DIRECTOR" staffSurface>
      <div>섹션 본문</div>
    </TournamentManagementContent>,
  );

const SAMPLE_NAVIGATION = {
  basePath: '/sample/tournaments/tournament-1',
  listHref: '/sample',
  operationsBasePath: '/sample/ops',
  localPopups: true,
};

const renderSample = () =>
  render(
    <TournamentManagementContent id="tournament-1" role="SUPPORT_READONLY" navigation={SAMPLE_NAVIGATION}>
      <div>섹션 본문</div>
    </TournamentManagementContent>,
  );

function openChipMenu() {
  const status = String(h.tournament.status);
  fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${CHIP_NAME[status]}`) }));
  return screen.queryByRole('dialog', { name: '대회 상태' }) ?? screen.getByRole('menu', { name: '대회 상태' });
}

/** 폰은 시트(button·switch), 데스크톱은 팝오버(menuitem·menuitemcheckbox) 라서 둘 다 찾는다. */
function menuAction(surface: HTMLElement, name: RegExp) {
  return within(surface).queryByRole('menuitem', { name }) ?? within(surface).getByRole('button', { name });
}

function visibilitySwitch(surface: HTMLElement) {
  const name = /참가자에게 공개/;
  return within(surface).queryByRole('menuitemcheckbox', { name }) ?? within(surface).getByRole('switch', { name });
}

const queryMenuAction = (surface: HTMLElement, name: RegExp) =>
  within(surface).queryByRole('menuitem', { name }) ?? within(surface).queryByRole('button', { name });

const tabNav = () => screen.getByRole('navigation', { name: '대회 관리 섹션' });

function openMore() {
  fireEvent.click(within(tabNav()).getByRole('button', { name: /더보기/ }));
  return screen.queryByRole('dialog', { name: '더보기' }) ?? screen.getByRole('menu', { name: '더보기' });
}

const moreLink = (surface: HTMLElement, name: RegExp) =>
  within(surface).queryByRole('menuitem', { name }) ?? within(surface).queryByRole('link', { name });

function openHeaderMore() {
  fireEvent.click(screen.getByRole('button', { name: '대회 더 보기' }));
  return screen.queryByRole('dialog', { name: '대회 더 보기' }) ?? screen.getByRole('menu', { name: '대회 더 보기' });
}

function apiError(message: string) {
  return new V1ApiError({
    status: 'error',
    statusCode: 409,
    code: 'TOURNAMENT_BANK_ACCOUNT_REQUIRED',
    message,
    details: undefined,
    timestamp: '2026-11-27T00:00:00.000Z',
  });
}

describe('머리', () => {
  it('대회 목록으로 링크가 listHref(스태프 면은 /tournament-management)를 가리키고 대회명이 h1 이다', () => {
    const platform = renderPlatform();
    expect(screen.getByRole('link', { name: '대회 목록으로' })).toHaveAttribute('href', '/admin/tournaments');
    expect(screen.getByRole('heading', { level: 1, name: '서울 풋살 챔피언십' })).toBeInTheDocument();
    platform.unmount();

    const staff = renderStaff();
    expect(screen.getByRole('link', { name: '대회 목록으로' })).toHaveAttribute('href', '/tournament-management');
    staff.unmount();

    renderSample();
    expect(screen.getByRole('link', { name: '대회 목록으로' })).toHaveAttribute('href', '/sample');
  });

  it('meta 한 줄은 장소 · 일정 · 팀 수이고 비어 있으면 미정으로 말한다', () => {
    const { unmount } = renderPlatform();
    expect(screen.getByText(/^서울 풋살장 · 2026\. 12\. 20\./)).toHaveTextContent(/ · 8팀$/);
    unmount();

    setTournament({ venue: null, scheduledAt: null });
    renderPlatform();
    expect(screen.getByText('장소 미정 · 일정 미정 · 8팀')).toBeInTheDocument();
  });

  it.each([
    ['draft', '접수 시작하기'],
    ['open', '접수 마감하기'],
    ['closed', '대회 시작하기'],
    ['in_progress', '대회 완료하기'],
  ])('%s 의 주 버튼은 「%s」 하나뿐이다', (status, label) => {
    setTournament({ status });
    renderPlatform();
    expect(screen.getAllByRole('button', { name: label })).toHaveLength(1);
  });

  it.each(['completed', 'cancelled'])('%s 에는 주 버튼이 없다', (status) => {
    setTournament({ status });
    renderPlatform();
    for (const label of ['접수 시작하기', '접수 마감하기', '대회 시작하기', '대회 완료하기']) {
      expect(screen.queryByRole('button', { name: label })).not.toBeInTheDocument();
    }
  });

  it('공개 설정 카드·스태프 배정 콘솔·운영 보드 칩·되돌리기 버튼 줄이 없고, 같은 기능은 칩 메뉴·⋯ 메뉴에서 닿는다', () => {
    setTournament({ status: 'completed' });
    renderPlatform();

    expect(screen.queryByRole('region', { name: '공개 설정' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '스태프 배정 콘솔' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '운영 보드' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '진행 중으로 되돌리기' })).not.toBeInTheDocument();

    const chipMenu = openChipMenu();
    expect(visibilitySwitch(chipMenu)).toBeInTheDocument();
    expect(menuAction(chipMenu, /진행 중으로 되돌리기/)).toBeInTheDocument();
    fireEvent.click(within(chipMenu).getByRole('button', { name: '닫기' }));

    const headerMenu = openHeaderMore();
    expect(within(headerMenu).getByRole('link', { name: '스태프 배정' })).toHaveAttribute(
      'href',
      '/admin/live/tournament-1/staff',
    );
  });
});

describe('현장 운영 (머리 ↔ ⋯ 메뉴)', () => {
  it('경기가 있으면 머리에 현장 운영 링크가 있고 ⋯ 안에는 스태프 배정만 있다', () => {
    const platform = renderPlatform();
    expect(screen.getByRole('link', { name: /현장 운영/ })).toHaveAttribute('href', '/admin/live/tournament-1/operations');
    const menu = openHeaderMore();
    expect(within(menu).getByRole('link', { name: '스태프 배정' })).toBeInTheDocument();
    expect(within(menu).queryByRole('link', { name: '현장 운영' })).not.toBeInTheDocument();
    platform.unmount();

    renderStaff();
    expect(screen.getByRole('link', { name: /현장 운영/ })).toHaveAttribute(
      'href',
      '/tournament-ops/tournaments/tournament-1/operations',
    );
  });

  it('경기가 없으면 현장 운영이 머리에서 빠지고 ⋯ 메뉴 안에 있다(양방향)', () => {
    setTournament({ operationCounts: { registrations: 3, fixtures: 0, announcements: 1 } });
    renderPlatform();

    expect(screen.queryByRole('link', { name: /현장 운영/ })).not.toBeInTheDocument();
    const menu = openHeaderMore();
    expect(within(menu).getByRole('link', { name: '현장 운영' })).toHaveAttribute('href', '/admin/live/tournament-1/operations');
    expect(within(menu).getByRole('link', { name: '스태프 배정' })).toHaveAttribute('href', '/admin/live/tournament-1/staff');
  });

  it('스태프 배정 조회가 403 이면 현장 운영 항목이 비활성이고 사유 글자가 보인다', () => {
    h.staff = {
      isPending: false,
      isError: true,
      error: new V1ApiError({
        status: 'error',
        statusCode: 403,
        code: 'STAFF_SCOPE_DENIED',
        message: 'denied',
        details: { reason: 'ASSIGNMENT_REQUIRED' },
        timestamp: '2026-11-27T00:00:00.000Z',
      }),
    };
    const reason = tournamentOpsAccessDeniedLabel('ASSIGNMENT_REQUIRED');

    const withFixtures = renderPlatform();
    expect(screen.queryByRole('link', { name: /현장 운영/ })).not.toBeInTheDocument();
    const header = screen.getByRole('button', { name: /현장 운영/ });
    expect(header).toBeDisabled();
    expect(header).toHaveTextContent(reason);
    withFixtures.unmount();

    setTournament({ operationCounts: { registrations: 3, fixtures: 0, announcements: 1 } });
    renderPlatform();
    const menu = openHeaderMore();
    const item = within(menu).getByRole('button', { name: /현장 운영/ });
    expect(item).toBeDisabled();
    expect(item).toHaveTextContent(reason);
  });
});

describe('탭', () => {
  it('탭은 개요·신청·대진·공지·대회 정보 + 더보기이고 링크는 대회 경로를 가리킨다', () => {
    renderPlatform();

    const nav = tabNav();
    const hrefOf = (name: string) => within(nav).getByRole('link', { name }).getAttribute('href');
    expect(hrefOf('개요')).toBe('/admin/tournaments/tournament-1/overview');
    expect(hrefOf('신청 3')).toBe('/admin/tournaments/tournament-1/registrations');
    expect(hrefOf('대진 4')).toBe('/admin/tournaments/tournament-1/bracket');
    expect(hrefOf('공지 1')).toBe('/admin/tournaments/tournament-1/announcements');
    expect(hrefOf('대회 정보')).toBe('/admin/tournaments/tournament-1/info');
    expect(within(nav).getByRole('link', { name: '개요' })).toHaveAttribute('aria-current', 'page');
    expect(within(nav).getByRole('button', { name: /더보기/ })).toBeInTheDocument();
    expect(within(nav).queryByRole('link', { name: '시상' })).not.toBeInTheDocument();
  });

  it('진행 중은 시상·리뷰 관리·통계가 탭이고 대회 정보는 더보기에 있다', () => {
    setTournament({ status: 'in_progress' });
    renderPlatform();

    const nav = tabNav();
    for (const name of ['시상', '리뷰 관리', '통계']) {
      expect(within(nav).getByRole('link', { name })).toBeInTheDocument();
    }
    expect(within(nav).queryByRole('link', { name: '대회 정보' })).not.toBeInTheDocument();
    expect(moreLink(openMore(), /대회 정보/)).toHaveAttribute('href', '/admin/tournaments/tournament-1/info');
  });

  it('플랫폼 어드민 더보기에는 팝업(전역 팝업 링크)·징계 현황이 있다', () => {
    renderPlatform();
    const more = openMore();

    expect(moreLink(more, /팝업/)).toHaveAttribute(
      'href',
      `/admin/content?tab=popups&targetPath=${encodeURIComponent('/tournaments/tournament-1')}`,
    );
    expect(moreLink(more, /징계 현황/)).toHaveAttribute('href', '/admin/tournaments/tournament-1/discipline');
    expect(moreLink(more, /협찬/)).toHaveAttribute('href', '/admin/tournaments/tournament-1/sponsors');
  });

  it('스태프 면 더보기에는 팝업·징계 현황이 없고 스태프 경로를 쓴다', () => {
    renderStaff();
    expect(within(tabNav()).getByRole('link', { name: '개요' })).toHaveAttribute(
      'href',
      '/tournament-management/tournaments/tournament-1/overview',
    );
    const more = openMore();

    expect(moreLink(more, /팝업/)).toBeNull();
    expect(moreLink(more, /징계 현황/)).toBeNull();
    expect(moreLink(more, /협찬/)).toHaveAttribute('href', '/tournament-management/tournaments/tournament-1/sponsors');
  });

  it('공개 샘플(navigation)은 징계가 없고 팝업이 샘플 경로 슬러그다', () => {
    renderSample();
    const more = openMore();

    expect(moreLink(more, /징계 현황/)).toBeNull();
    expect(moreLink(more, /팝업/)).toHaveAttribute('href', '/sample/tournaments/tournament-1/popups');
  });

  it('operationCounts 가 없어도 탭이 깨지지 않는다', () => {
    setTournament({ operationCounts: undefined });
    renderPlatform();

    const nav = tabNav();
    expect(within(nav).getByRole('link', { name: '신청' })).toBeInTheDocument();
    expect(within(nav).getByRole('link', { name: '대진' })).toBeInTheDocument();
    expect(nav).not.toHaveTextContent(/undefined|NaN/);
    // 경기가 없다고 보므로 현장 운영은 머리가 아니라 ⋯ 안에 있다.
    expect(screen.queryByRole('link', { name: /현장 운영/ })).not.toBeInTheDocument();
  });
});

describe('권한', () => {
  it('조회 전용 관리자는 주 버튼·상태 바꾸기·대회 취소가 없고 공개 스위치는 비활성이다', () => {
    h.adminRole = 'support';
    renderPlatform();

    expect(screen.queryByRole('button', { name: '접수 마감하기' })).not.toBeInTheDocument();
    const menu = openChipMenu();
    expect(queryMenuAction(menu, /접수 마감하기/)).toBeNull();
    expect(queryMenuAction(menu, /대회 취소하기/)).toBeNull();
    const toggle = visibilitySwitch(menu);
    expect(toggle).toBeDisabled();
    expect(toggle).toHaveAttribute('aria-checked', 'true');
  });

  it('조회 전용 관리자에게는 완료 대회의 되돌리기 항목이 없다', () => {
    h.adminRole = 'support';
    setTournament({ status: 'completed' });
    renderPlatform();
    expect(queryMenuAction(openChipMenu(), /되돌리기/)).toBeNull();
  });

  it('조회 전용 관리자는 취소된 대회에서 복구할 수 없고 칩은 상태만 보인다', () => {
    h.adminRole = 'support';
    setTournament({ status: 'cancelled' });
    renderPlatform();
    expect(screen.queryByRole('button', { name: /취소됨/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /초안으로 복구/ })).not.toBeInTheDocument();
    expect(screen.getByText('취소됨')).toBeInTheDocument();
  });

  it('첫 경기 시작 전이어도 조회 전용 관리자는 접수 마감 복귀 항목이 없다', () => {
    h.adminRole = 'support';
    setTournament({ status: 'in_progress', canRevertStart: true });
    renderPlatform();
    expect(queryMenuAction(openChipMenu(), /접수 마감으로 되돌리기/)).toBeNull();
  });
});

describe('상태 확인 창', () => {
  const FORWARD: [string, string, string, string][] = [
    ['draft', '접수 시작하기', '접수를 시작할까요?', 'open'],
    ['open', '접수 마감하기', '접수를 마감할까요?', 'closed'],
    ['closed', '대회 시작하기', '대회를 시작할까요?', 'in_progress'],
    ['in_progress', '대회 완료하기', '대회를 완료할까요?', 'completed'],
  ];

  it.each(FORWARD)('%s 에서 「%s」 는 확인 창을 거쳐야 실행된다', async (status, button, title, target) => {
    setTournament({ status });
    renderPlatform();

    fireEvent.click(screen.getByRole('button', { name: button }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(title)).toBeInTheDocument();
    expect(h.statusMutate).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole('button', { name: button }));
    await vi.waitFor(() => expect(h.statusMutate).toHaveBeenCalledTimes(1));
    expect(h.statusMutate).toHaveBeenCalledWith({ status: target }, expect.anything());
  });

  it('접수 다시 열기는 칩 메뉴에서 확인 창을 거쳐 open 으로 보낸다', async () => {
    setTournament({ status: 'closed' });
    renderPlatform();

    fireEvent.click(menuAction(openChipMenu(), /접수 다시 열기/));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('접수를 다시 열까요?')).toBeInTheDocument();
    expect(h.statusMutate).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole('button', { name: '접수 다시 열기' }));
    await vi.waitFor(() => expect(h.statusMutate).toHaveBeenCalledWith({ status: 'open' }, expect.anything()));
  });

  it('확인 창에서 취소하면 상태 변경을 요청하지 않는다', async () => {
    setTournament({ status: 'in_progress' });
    renderPlatform();

    fireEvent.click(screen.getByRole('button', { name: '대회 완료하기' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: '취소' }));

    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(h.statusMutate).not.toHaveBeenCalled();
  });

  it('필요 항목(장소·정산 계좌)이 남아도 접수 시작을 막지 않고 확인 창에 항목을 경고한다', async () => {
    setTournament({ status: 'draft', venue: null, entryFee: 30000, bankAccount: null });
    renderPlatform();

    fireEvent.click(screen.getByRole('button', { name: '접수 시작하기' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/장소, 정산 계좌/)).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: '접수 시작하기' }));
    await vi.waitFor(() => expect(h.statusMutate).toHaveBeenCalledWith({ status: 'open' }, expect.anything()));
  });

  it('필요 항목이 없으면 경고 문장이 없다', async () => {
    setTournament({ status: 'draft' });
    renderPlatform();

    fireEvent.click(screen.getByRole('button', { name: '접수 시작하기' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/참가자에게 대회가 공개돼요/)).toBeInTheDocument();
    expect(dialog).not.toHaveTextContent('아직 채우지 않은 설정');
  });

  it('초안에서 필요 항목이 남으면 접수 시작하기가 outline, 0 이면 primary 버튼이다', () => {
    setTournament({ status: 'draft', venue: null });
    const remaining = renderPlatform();
    expect(screen.getByRole('button', { name: '접수 시작하기' }).className).toContain('tm-btn-outline');
    remaining.unmount();

    setTournament({ status: 'draft' });
    renderPlatform();
    expect(screen.getByRole('button', { name: '접수 시작하기' }).className).toContain('tm-btn-primary');
  });

  it('초안이 아닌 상태의 주 버튼은 필요 항목이 남아도 항상 primary 다', () => {
    setTournament({ status: 'open', venue: null });
    renderPlatform();
    expect(screen.getByRole('button', { name: '접수 마감하기' }).className).toContain('tm-btn-primary');
  });

  it('접수 시작을 확인한 뒤 서버가 거절하면 서버 메시지를 토스트로 보이고 상태 표시는 그대로다', async () => {
    setTournament({ status: 'draft', entryFee: 30000, bankAccount: null });
    renderPlatform();

    fireEvent.click(screen.getByRole('button', { name: '접수 시작하기' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: '접수 시작하기' }));
    await vi.waitFor(() => expect(h.statusMutate).toHaveBeenCalledTimes(1));

    act(() => h.statusMutate.mock.calls[0][1].onError(apiError('참가비를 받는 대회는 정산 계좌가 있어야 접수를 시작할 수 있어요.')));

    expect(await screen.findByText('참가비를 받는 대회는 정산 계좌가 있어야 접수를 시작할 수 있어요.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '초안 · 공개' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '접수 시작하기' })).toBeEnabled();
  });

  it('성공하면 상태를 변경했어요 토스트를 보인다', async () => {
    setTournament({ status: 'open' });
    renderPlatform();

    fireEvent.click(screen.getByRole('button', { name: '접수 마감하기' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '접수 마감하기' }));
    await vi.waitFor(() => expect(h.statusMutate).toHaveBeenCalledTimes(1));

    act(() => h.statusMutate.mock.calls[0][1].onSuccess({ alreadyInStatus: false }));
    expect(await screen.findByText('상태를 변경했어요.')).toBeInTheDocument();
  });
});

describe('공개 스위치', () => {
  it('공개 스위치를 누르면 isPublic=false 로 저장하고 성공·실패가 토스트로 나온다', async () => {
    renderPlatform();

    fireEvent.click(visibilitySwitch(openChipMenu()));
    expect(h.visibilityMutate).toHaveBeenCalledTimes(1);
    expect(h.visibilityMutate).toHaveBeenCalledWith({ isPublic: false }, expect.anything());
    // 메뉴는 항목을 고르면 닫힌다.
    expect(screen.queryByRole('dialog', { name: '대회 상태' })).not.toBeInTheDocument();

    const callbacks = h.visibilityMutate.mock.calls[0][1];
    act(() => callbacks.onSuccess());
    expect(await screen.findByText('공개 상태를 저장했어요.')).toBeInTheDocument();

    act(() => callbacks.onError(Object.assign(new Error('x'), { response: { data: { message: '공개 상태를 저장하지 못했어요.' } } })));
    expect(await screen.findByText('공개 상태를 저장하지 못했어요.')).toBeInTheDocument();
  });

  it('비공개 대회는 칩이 비공개를 말하고 스위치를 누르면 isPublic=true 로 저장한다', () => {
    setTournament({ isPublic: false });
    renderPlatform();

    const menu = openChipMenu();
    expect(visibilitySwitch(menu)).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(visibilitySwitch(menu));
    expect(h.visibilityMutate).toHaveBeenCalledWith({ isPublic: true }, expect.anything());
  });
});

describe('취소·되돌리기 사유 창', () => {
  it.each(['draft', 'open', 'closed', 'in_progress'])('%s 대회 취소는 공백 사유를 막고 trim한 사유를 보낸다', async (status) => {
    setTournament({ status });
    renderPlatform();

    fireEvent.click(menuAction(openChipMenu(), /대회 취소하기/));
    const dialog = await screen.findByRole('alertdialog');
    const submit = within(dialog).getByRole('button', { name: '대회 취소하기' });
    const reason = within(dialog).getByRole('textbox', { name: /사유/ });
    expect(submit).toBeDisabled();
    fireEvent.change(reason, { target: { value: ' \n\t ' } });
    fireEvent.click(submit);
    expect(h.statusMutate).not.toHaveBeenCalled();
    expect(reason).toHaveAttribute('maxLength', '500');
    fireEvent.change(reason, { target: { value: ' 폭우로 안전 확보 불가 ' } });
    fireEvent.click(submit);
    expect(h.statusMutate).toHaveBeenCalledWith({ status: 'cancelled', reason: '폭우로 안전 확보 불가' }, expect.anything());
    act(() => h.statusMutate.mock.calls[0][1].onError(new Error('일시적인 오류')));
    expect(reason).toHaveValue(' 폭우로 안전 확보 불가 ');
    expect(dialog).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: '돌아가기' }));
    expect(h.statusMutate).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['completed', '진행 중으로 되돌리기', 'in_progress', '되돌리기'],
    ['cancelled', '초안으로 복구', 'draft', '복구하기'],
  ])('%s 대회는 사유를 받아 %s 로 되돌린다', async (status, label, target, confirmName) => {
    setTournament({ status });
    renderPlatform();

    fireEvent.click(menuAction(openChipMenu(), new RegExp(label)));
    const dialog = await screen.findByRole('alertdialog');
    const confirm = within(dialog).getByRole('button', { name: confirmName });
    expect(confirm).toBeDisabled();
    expect(h.statusMutate).not.toHaveBeenCalled();

    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: ' 잘못 눌렀어요 ' } });
    fireEvent.click(confirm);
    expect(h.statusMutate).toHaveBeenCalledWith({ status: target, reason: '잘못 눌렀어요' }, expect.anything());
  });

  it('첫 경기 시작 전에는 사유를 받아 접수 마감으로 되돌린다', async () => {
    setTournament({ status: 'in_progress', canRevertStart: true });
    renderPlatform();

    fireEvent.click(menuAction(openChipMenu(), /접수 마감으로 되돌리기/));
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText(/시작한 경기가 없을 때만/)).toBeInTheDocument();
    const confirm = within(dialog).getByRole('button', { name: '되돌리기' });
    expect(confirm).toBeDisabled();
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: ' 대회 시작을 잘못 눌렀어요 ' } });
    fireEvent.click(confirm);
    expect(h.statusMutate).toHaveBeenCalledWith({ status: 'closed', reason: '대회 시작을 잘못 눌렀어요' }, expect.anything());
  });

  it('진행 중 대회는 시작 전이 아니면 접수 마감 되돌리기 항목이 없다', () => {
    setTournament({ status: 'in_progress', canRevertStart: false });
    renderPlatform();
    expect(queryMenuAction(openChipMenu(), /되돌리기/)).toBeNull();
  });

  it.each([
    ['폰', 390],
    ['데스크톱', 1440],
  ])('메뉴 항목을 고르면 메뉴가 닫힌 뒤 사유 창이 열린다 — %s', async (_name, width) => {
    media.setWidth(width);
    renderPlatform();

    fireEvent.click(menuAction(openChipMenu(), /대회 취소하기/));

    expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: '대회 상태' })).not.toBeInTheDocument();
  });
});

describe('데스크톱 폭', () => {
  it('상태 칩 메뉴가 팝오버로 열리고 항목을 고르면 같은 확인 창을 띄운다', async () => {
    media.setWidth(1440);
    setTournament({ status: 'closed' });
    renderPlatform();

    const menu = openChipMenu();
    expect(menu).toHaveAttribute('role', 'menu');
    fireEvent.click(within(menu).getByRole('menuitem', { name: /대회 시작하기/ }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('대회를 시작할까요?')).toBeInTheDocument();
  });
});
