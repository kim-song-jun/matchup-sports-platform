import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TournamentOpsDemo } from './tournament-ops-demo';
import { TournamentOpsDemoEntry } from './demo-entry';
import { TournamentOverviewSection } from '@/app/admin/tournaments/[id]/overview-section';
import Registrations from '@/app/admin/tournaments/[id]/registrations/page';
import { TournamentInfoSection } from '@/app/admin/tournaments/[id]/info-section';
import Bracket from '@/app/admin/tournaments/[id]/bracket/page';
import Announcements from '@/app/admin/tournaments/[id]/announcements/page';
import Sponsors from '@/app/admin/tournaments/[id]/sponsors/page';
import Campaign from '@/app/admin/tournaments/[id]/campaign/page';
import Reviews from '@/app/admin/tournaments/[id]/reviews/page';
import Awards from '@/app/admin/tournaments/[id]/awards/page';
import Statistics from '@/app/admin/tournaments/[id]/statistics/page';
import { PopupsView } from '@/app/admin/content/popups-view';
import { useIsFetching } from '@tanstack/react-query';
import { BracketNodePanel } from '@/components/admin/bracket-canvas/bracket-node-panel';
import { OperationsBoardClient } from '@/components/tournament-live/operations-board-client';
import { StaffClient } from '@/components/tournament-live/staff-client';
import { TournamentOpsRoleProvider } from '@/components/tournament-ops/role-context';
import { useV1AdminBracket, useV1AdminTournamentRegistrations } from '@/hooks/use-v1-api';
import { ADMIN_DEMO_ID, ADMIN_DEMO_STORAGE_KEY, createAdminDemoState, restoreAdminDemo } from '@/lib/tournament-admin-demo';

const nav = vi.hoisted(() => ({ pathname: '/tournament-ops-demo/registrations', push: vi.fn(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({
  usePathname: () => nav.pathname,
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: nav.push, replace: nav.replace }),
}));
beforeEach(() => { sessionStorage.clear(); vi.restoreAllMocks(); });
function QueriesSettled() {
  const pending = useIsFetching();
  return <output data-testid="pending-queries">{pending}</output>;
}
function FixturePanel() {
  const { data: bracket } = useV1AdminBracket(ADMIN_DEMO_ID);
  const { data: registrations } = useV1AdminTournamentRegistrations(ADMIN_DEMO_ID);
  if (!bracket?.fixtures[0] || !registrations) return null;
  return <BracketNodePanel tournamentId={ADMIN_DEMO_ID} fixture={bracket.fixtures[0]}
    fixtures={bracket.fixtures} groups={bracket.groups} slots={bracket.slots} registrations={registrations.items}
    registrationsLoaded sideLabels={{ HOME: '블루 FC', AWAY: '오렌지 FS' }} canWrite showToast={() => {}} onClose={() => {}} />;
}
function seedBracket() {
  const registrations = createAdminDemoState().registrations;
  const commands = [
    ...registrations.map((r) => ({ method: 'PATCH', path: `/admin/registrations/${r.id}/confirm`, body: {} })),
    { method: 'POST', path: `/admin/tournaments/${ADMIN_DEMO_ID}/bracket/template`, body: { kind: 'knockout', size: 4, thirdPlace: false } },
    { method: 'POST', path: `/admin/tournaments/${ADMIN_DEMO_ID}/slots/random-fill` },
  ];
  sessionStorage.setItem(ADMIN_DEMO_STORAGE_KEY, JSON.stringify({ version: 2, commands }));
}

describe('실제 어드민을 사용하는 공개 대회 체험', () => {
  it('실제 대회 정보 편집 모달로 대회명을 저장하고 공유 헤더에 반영한다', async () => {
    const user = userEvent.setup();
    const network = vi.spyOn(globalThis, 'fetch');
    render(<TournamentOpsDemo><TournamentInfoSection /></TournamentOpsDemo>);
    await user.click(await screen.findByRole('button', { name: '대회 정보 수정' }));
    const dialog = await screen.findByRole('dialog');
    const title = within(dialog).getByLabelText(/^대회명/);
    await user.clear(title); await user.type(title, '파트너 시연 대회');
    await user.click(within(dialog).getByRole('button', { name: '저장' }));
    expect(await screen.findByRole('heading', { name: '파트너 시연 대회' })).toBeInTheDocument();
    expect(restoreAdminDemo(sessionStorage.getItem(ADMIN_DEMO_STORAGE_KEY)).state.tournament.title).toBe('파트너 시연 대회');
    expect(network).not.toHaveBeenCalled();
  });
  it.each([['operations', OperationsBoardClient], ['staff', StaffClient]] as const)('%s 현장 화면도 실제 컴포넌트와 격리 데이터를 사용한다', async (slug, Section) => {
    nav.pathname = `/tournament-ops-demo/${slug}`;
    const network = vi.spyOn(globalThis, 'fetch');
    render(<TournamentOpsDemo><TournamentOpsRoleProvider role="PLATFORM_OPS"><Section tournamentId={ADMIN_DEMO_ID} /></TournamentOpsRoleProvider><QueriesSettled /></TournamentOpsDemo>);
    expect(await screen.findByRole('region', { name: '대회 관리 내용' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('pending-queries')).toHaveTextContent('0'));
    expect(screen.queryByText(/아직 체험에서 지원하지 않아요/)).not.toBeInTheDocument();
    expect(network).not.toHaveBeenCalled();
  });
  it('실제 대진 점수 입력과 확인 모달로 결과를 확정하고 결승에 반영한다', async () => {
    seedBracket();
    const user = userEvent.setup();
    const network = vi.spyOn(globalThis, 'fetch');
    render(<TournamentOpsDemo><FixturePanel /></TournamentOpsDemo>);
    await user.type(await screen.findByLabelText('블루 FC 점수'), '2');
    await user.type(screen.getByLabelText('오렌지 FS 점수'), '1');
    await user.click(screen.getByRole('button', { name: '점수 확정' }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '점수 확정' }));
    await waitFor(() => expect(restoreAdminDemo(sessionStorage.getItem(ADMIN_DEMO_STORAGE_KEY)).state.bracket.fixtures[0].result?.homeScore).toBe(2));
    expect(restoreAdminDemo(sessionStorage.getItem(ADMIN_DEMO_STORAGE_KEY)).state.bracket.fixtures[2].homeTeamName).toBe('블루 FC');
    expect(network).not.toHaveBeenCalled();
  });
  it('저장 공간이 부족하면 실제 점수 입력 화면에 실패를 알리고 결과를 반영하지 않는다', async () => {
    seedBracket();
    const user = userEvent.setup();
    render(<TournamentOpsDemo><FixturePanel /></TournamentOpsDemo>);
    await user.type(await screen.findByLabelText('블루 FC 점수'), '2');
    await user.type(screen.getByLabelText('오렌지 FS 점수'), '1');
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('체험 저장 공간이 부족해요.'); });
    await user.click(screen.getByRole('button', { name: '점수 확정' }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '점수 확정' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('저장 공간이 부족');
    expect(restoreAdminDemo(sessionStorage.getItem(ADMIN_DEMO_STORAGE_KEY)).state.bracket.fixtures[0].result).toBeNull();
    expect(screen.getByLabelText('블루 FC 점수')).toHaveValue('2');
  });
  it.each([
    ['info', TournamentInfoSection], ['bracket', Bracket], ['announcements', Announcements],
    ['sponsors', Sponsors], ['campaign', Campaign], ['reviews', Reviews], ['awards', Awards],
    ['statistics', Statistics], ['popups', PopupsView],
  ] as const)('%s 실제 섹션이 체험 데이터로 열리고 실제 API를 부르지 않는다', async (slug, Section) => {
    nav.pathname = `/tournament-ops-demo/${slug}`;
    const network = vi.spyOn(globalThis, 'fetch');
    render(<TournamentOpsDemo><Section /><QueriesSettled /></TournamentOpsDemo>);
    expect(await screen.findByRole('region', { name: '대회 관리 내용' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('pending-queries')).toHaveTextContent('0'));
    expect(screen.queryByText(/아직 체험에서 지원하지 않아요/)).not.toBeInTheDocument();
    expect(network).not.toHaveBeenCalled();
  });
  it('복귀 링크는 샘플 화면의 이동 제한에 막히지 않는다', async () => {
    sessionStorage.setItem('teameet.demo.return-path', '/admin/ops/tournaments');
    render(<TournamentOpsDemo><div>체험</div></TournamentOpsDemo>);
    const link = await screen.findByRole('link', { name: '대회 운영으로 돌아가기' });
    expect(link).toHaveAttribute('href', '/admin/ops/tournaments');
    nav.replace.mockClear();
    nav.push.mockClear();
    fireEvent.click(link);
    // 복귀 링크는 push 가 아니라 뒤로가기 규칙(replace)으로 가고, 체험 화면의 이동 제한 안내는 뜨지 않는다.
    expect(nav.replace).toHaveBeenCalledWith('/admin/ops/tournaments');
    expect(nav.push).not.toHaveBeenCalled();
    expect(screen.queryByText('이 링크는 실제 서비스의 화면이에요. 샘플 체험 안에서는 이동하지 않아요.')).not.toBeInTheDocument();
  });
  it('체험 진입은 로그인 없는 공개 경로를 유지한다', () => {
    render(<TournamentOpsDemoEntry />);
    expect(screen.getByRole('link', { name: /운영 콘솔 체험하기/ })).toHaveAttribute('href', '/field-console-demo');
  });
  it('실제 관리 셸과 11개 섹션을 샘플 경로 안에서 제공한다', async () => {
    const network = vi.spyOn(globalThis, 'fetch');
    render(<TournamentOpsDemo><TournamentOverviewSection /></TournamentOpsDemo>);
    expect(await screen.findByRole('heading', { name: 'Teameet 파트너컵 · 샘플' })).toBeInTheDocument();
    const menu = screen.getByRole('navigation', { name: '대회 관리 섹션' });
    const links = within(menu).getAllByRole('link');
    expect(links).toHaveLength(11);
    for (const link of links) expect(link.getAttribute('href')).toMatch(/^\/tournament-ops-demo\//);
    expect(within(menu).getByRole('link', { name: '신청 관리 4' })).toHaveAttribute('href', '/tournament-ops-demo/registrations');
    expect(network).not.toHaveBeenCalled();
  });
  it('실제 신청 관리에서 참가 확정하고 다시 열어 복원한다', async () => {
    const network = vi.spyOn(globalThis, 'fetch');
    const user = userEvent.setup();
    const view = render(<TournamentOpsDemo><Registrations /></TournamentOpsDemo>);
    const team = await screen.findByText('블루 FC');
    await user.click(within(team.closest('li')!).getByRole('button', { name: '확정' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: '확정' }));
    await waitFor(() => expect(JSON.parse(sessionStorage.getItem(ADMIN_DEMO_STORAGE_KEY)!).commands).toHaveLength(1));
    view.unmount(); render(<TournamentOpsDemo><Registrations /></TournamentOpsDemo>);
    const restored = await screen.findByText('블루 FC');
    expect(within(restored.closest('li')!).queryByRole('button', { name: '확정' })).not.toBeInTheDocument();
    expect(within(screen.getByText('오렌지 FS').closest('li')!).getByRole('button', { name: '확정' })).toBeInTheDocument();
    expect(network).not.toHaveBeenCalled();
  });
  it('손상된 저장 기록은 관리 액션을 열지 않고 자기 체험만 초기화한다', async () => {
    sessionStorage.setItem(ADMIN_DEMO_STORAGE_KEY, 'broken'); sessionStorage.setItem('unrelated', 'preserve');
    const user = userEvent.setup();
    render(<TournamentOpsDemo><TournamentOverviewSection /></TournamentOpsDemo>);
    expect(await screen.findByRole('alert')).toHaveTextContent('체험 기록을 읽거나 저장하지 못했어요');
    expect(screen.queryByRole('navigation', { name: '대회 관리 섹션' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '체험 초기화' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '체험 초기화' }));
    expect(await screen.findByRole('navigation', { name: '대회 관리 섹션' })).toBeInTheDocument();
    expect(sessionStorage.getItem('unrelated')).toBe('preserve');
  });
  it('공유 복사 실패를 표시하고 시작 URL 직접 복사를 제공한다', async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('denied'));
    render(<TournamentOpsDemo><TournamentOverviewSection /></TournamentOpsDemo>);
    await user.click(screen.getByRole('button', { name: '공유 링크 복사' }));
    expect(screen.getByRole('alert')).toHaveTextContent('직접 선택해 복사');
    expect(screen.getByLabelText('공유할 체험 주소')).toHaveValue(window.location.origin + '/tournament-ops-demo');
  });
});
