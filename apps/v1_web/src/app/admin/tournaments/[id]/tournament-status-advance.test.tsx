/**
 * tournament-status-advance.test.tsx
 *
 * 다음 단계 주 버튼의 자리는 폭이 정한다: 데스크톱 셸(사이드바가 나오는 폭)에서는 머리에,
 * 폰·태블릿에서는 개요 첫 카드 아래에 둔다. 두 자리는 같은 동작·같은 확인 창·같은 권한 판정을 쓰고
 * 어느 폭에서도 한 곳에만 있다. 다른 탭에서는 상태 칩 메뉴가 다음 단계를 맡는다.
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetOverlayHistoryForTests } from '@/lib/overlay-history';
import { installMatchMedia } from '@/test/match-media';
import { TournamentOverviewSection } from './overview-section';
import { TournamentManagementContent } from './tournament-admin-shell';

const h = vi.hoisted(() => ({
  adminRole: 'ops' as 'owner' | 'ops' | 'support',
  tournament: {} as Record<string, unknown>,
  statusPending: false,
  statusMutate: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/tournaments/tournament-1/overview',
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: vi.fn() }),
}));

vi.mock('@/hooks/use-v1-api', () => ({
  useV1AdminTournament: () => ({ data: h.tournament, isPending: false, isError: false, error: null, refetch: vi.fn() }),
  useV1AdminMe: () => ({ data: { capabilities: ['status:write'], adminRole: h.adminRole } }),
  useV1ChangeTournamentStatus: () => ({ mutate: h.statusMutate, isPending: h.statusPending }),
  useV1UpdateTournamentVisibility: () => ({ mutate: vi.fn(), isPending: false }),
  useV1TournamentStaffAssignments: () => ({ data: { items: [] }, isPending: false, isError: false, error: null }),
}));

const FILLED = {
  id: 'tournament-1',
  title: '서울 풋살 챔피언십',
  status: 'open',
  canRevertStart: false,
  isPublic: true,
  venue: '서울 풋살장',
  scheduledAt: '2099-12-20T09:00:00+09:00',
  scheduledEndAt: null,
  registrationDeadlineAt: '2099-12-17T23:59:00+09:00',
  rosterDeadlineAt: '2099-12-18T23:59:00+09:00',
  bracketPublishedAt: '2020-01-01T09:00:00+09:00',
  bracketPublishScheduledAt: null,
  coverImageUrl: '/uploads/2026/08/cover.webp',
  entryFee: 0,
  bankAccount: null,
  minPlayers: 6,
  maxPlayers: 10,
  teamCount: 8,
  registrationCount: 3,
  sport: { code: 'futsal', name: '풋살' },
  operationCounts: { registrations: 3, fixtures: 4, announcements: 1 },
};

const setTournament = (overrides: Record<string, unknown> = {}) => {
  h.tournament = { ...FILLED, ...overrides };
};

let media: ReturnType<typeof installMatchMedia>;

beforeEach(() => {
  media = installMatchMedia(390);
  h.adminRole = 'ops';
  h.statusPending = false;
  h.statusMutate.mockReset();
  setTournament();
});

afterEach(() => {
  media.restore();
  __resetOverlayHistoryForTests();
});

const renderOverview = () =>
  render(
    <TournamentManagementContent id="tournament-1" role={h.adminRole === 'support' ? 'SUPPORT_READONLY' : 'PLATFORM_OPS'}>
      <TournamentOverviewSection />
    </TournamentManagementContent>,
  );

const renderOtherTab = () =>
  render(
    <TournamentManagementContent id="tournament-1" role="PLATFORM_OPS">
      <div>신청 탭 본문</div>
    </TournamentManagementContent>,
  );

const summaryCard = () => screen.getByRole('region', { name: '대회 진행 상태' });

const FORWARD: [string, string, string, string, string][] = [
  ['draft', '접수 시작하기', '접수를 시작할까요?', 'open', '시작하면 참가팀이 신청할 수 있어요. 비어 있는 설정은 시작한 뒤에도 채울 수 있어요.'],
  ['open', '접수 마감하기', '접수를 마감할까요?', 'closed', '마감하면 새 신청을 더 받지 않아요. 필요하면 다시 열 수 있어요.'],
  ['closed', '대회 시작하기', '대회를 시작할까요?', 'in_progress', '시작하기 전에 대진표와 경기 일정을 확인해 주세요.'],
  ['in_progress', '대회 완료하기', '대회를 완료할까요?', 'completed', '완료하면 시상과 후기가 열리고 참가팀에 후기 요청 알림이 가요.'],
];

describe('폰·태블릿 — 다음 단계 버튼은 개요 카드에 있다', () => {
  it.each([390, 768])('%i 폭에서는 머리가 아니라 요약 카드 안에 한 번만 있고 한 줄 안내가 붙는다', (width) => {
    media.setWidth(width);
    renderOverview();

    expect(screen.getAllByRole('button', { name: '접수 마감하기' })).toHaveLength(1);
    const card = summaryCard();
    expect(within(card).getByRole('button', { name: '접수 마감하기' })).toBeInTheDocument();
    expect(within(card).getByText('마감하면 새 신청을 더 받지 않아요. 필요하면 다시 열 수 있어요.')).toBeInTheDocument();
  });

  it.each(FORWARD)('%s: 카드의 「%s」 는 확인 창을 거쳐 같은 전이로 실행된다', async (status, button, title, target, hint) => {
    setTournament({ status });
    renderOverview();

    expect(within(summaryCard()).getByText(hint)).toBeInTheDocument();
    fireEvent.click(within(summaryCard()).getByRole('button', { name: button }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(title)).toBeInTheDocument();
    expect(h.statusMutate).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole('button', { name: button }));
    await vi.waitFor(() => expect(h.statusMutate).toHaveBeenCalledTimes(1));
    expect(h.statusMutate).toHaveBeenCalledWith({ status: target }, expect.anything());
  });

  it('확인 창에서 취소하면 상태 변경을 요청하지 않는다', async () => {
    renderOverview();

    fireEvent.click(within(summaryCard()).getByRole('button', { name: '접수 마감하기' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '취소' }));

    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(h.statusMutate).not.toHaveBeenCalled();
  });

  it('초안에서 필요 항목이 남으면 접수 시작하기는 outline, 0 이면 primary 버튼이다 — 머리와 같은 판정', () => {
    setTournament({ status: 'draft', venue: null });
    const remaining = renderOverview();
    expect(within(summaryCard()).getByRole('button', { name: '접수 시작하기' }).className).toContain('tm-btn-outline');
    remaining.unmount();

    setTournament({ status: 'draft' });
    renderOverview();
    expect(within(summaryCard()).getByRole('button', { name: '접수 시작하기' }).className).toContain('tm-btn-primary');
  });

  it('상태를 바꾸는 중이면 카드 버튼이 잠긴다', () => {
    h.statusPending = true;
    renderOverview();
    expect(within(summaryCard()).getByRole('button', { name: '접수 마감하기' })).toBeDisabled();
  });

  it('조회 전용 관리자에게는 카드에 버튼도 안내 줄도 없다', () => {
    h.adminRole = 'support';
    renderOverview();

    const card = summaryCard();
    expect(within(card).queryByRole('button')).not.toBeInTheDocument();
    expect(within(card).queryByText(/마감하면 새 신청을/)).not.toBeInTheDocument();
  });

  it.each(['completed', 'cancelled'])('%s 에는 다음 단계가 없어 카드에 버튼 줄이 없다', (status) => {
    setTournament({ status });
    renderOverview();
    expect(within(summaryCard()).queryByRole('button')).not.toBeInTheDocument();
  });
});

describe('데스크톱 셸 폭 — 다음 단계 버튼은 머리에 있다', () => {
  it('머리에 한 번만 있고 개요 카드에는 없다(중복 금지)', () => {
    media.setWidth(1440);
    renderOverview();

    expect(screen.getAllByRole('button', { name: '접수 마감하기' })).toHaveLength(1);
    expect(within(summaryCard()).queryByRole('button')).not.toBeInTheDocument();
    expect(within(summaryCard()).queryByText(/마감하면 새 신청을/)).not.toBeInTheDocument();
  });

  it('창 폭이 바뀌면 같은 버튼이 머리와 카드 사이를 옮겨 가고 어느 쪽에서도 하나뿐이다', () => {
    media.setWidth(1440);
    renderOverview();
    expect(within(summaryCard()).queryByRole('button', { name: '접수 마감하기' })).not.toBeInTheDocument();

    media.setWidth(768);
    expect(screen.getAllByRole('button', { name: '접수 마감하기' })).toHaveLength(1);
    expect(within(summaryCard()).getByRole('button', { name: '접수 마감하기' })).toBeInTheDocument();

    media.setWidth(1440);
    expect(screen.getAllByRole('button', { name: '접수 마감하기' })).toHaveLength(1);
    expect(within(summaryCard()).queryByRole('button', { name: '접수 마감하기' })).not.toBeInTheDocument();
  });

  it('머리의 버튼도 같은 확인 창을 거쳐 같은 전이로 실행된다', async () => {
    media.setWidth(1440);
    renderOverview();

    fireEvent.click(screen.getByRole('button', { name: '접수 마감하기' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '접수 마감하기' }));
    await vi.waitFor(() => expect(h.statusMutate).toHaveBeenCalledWith({ status: 'closed' }, expect.anything()));
  });
});

describe('다른 탭 — 폰·태블릿은 상태 칩 메뉴로 다음 단계를 바꾼다', () => {
  it.each([390, 768])('%i 폭: 머리에 주 버튼이 없고 칩 메뉴의 항목이 같은 확인 창을 거친다', async (width) => {
    media.setWidth(width);
    renderOtherTab();

    expect(screen.queryByRole('button', { name: '접수 마감하기' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^접수 중/ }));
    const surface = screen.queryByRole('dialog', { name: '대회 상태' }) ?? screen.getByRole('menu', { name: '대회 상태' });
    fireEvent.click(within(surface).queryByRole('menuitem', { name: /접수 마감하기/ }) ?? within(surface).getByRole('button', { name: /접수 마감하기/ }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('접수를 마감할까요?')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: '접수 마감하기' }));
    await vi.waitFor(() => expect(h.statusMutate).toHaveBeenCalledWith({ status: 'closed' }, expect.anything()));
  });
});
