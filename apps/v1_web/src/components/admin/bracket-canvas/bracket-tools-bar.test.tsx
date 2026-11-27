import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installViewport } from '@/test/viewport';
import { makeBracket, makeFixture, makeGroup, makeRegistration, makeSlot } from '@/test/bracket-canvas-fixtures';
import type { V1AdminTournamentBracket, V1Tournament } from '@/types/api';
import type { RegistrationsLoadState } from './bracket-team-tray';
import { BracketToolsBar } from './bracket-tools-bar';
import { useBracketTools } from './use-bracket-tools';
import { useBracketViewControls, type BracketViewControls } from './use-bracket-view-controls';

vi.mock('next/navigation', () => ({ usePathname: () => '/admin/tournaments/t-1/bracket', useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }) }));

const mocks = vi.hoisted(() => ({
  bracket: { data: undefined as unknown, isPending: false, refetch: vi.fn() },
  randomFill: vi.fn(),
  publish: vi.fn(),
  unpublish: vi.fn(),
  resetPreview: vi.fn(),
  resetMutate: vi.fn(),
}));
vi.mock('@/hooks/use-v1-api', () => ({
  useV1AdminBracket: () => mocks.bracket,
  useV1PublishTournamentBracket: () => ({ mutate: mocks.publish, isPending: false }),
  useV1UnpublishTournamentBracket: () => ({ mutate: mocks.unpublish, isPending: false }),
}));
vi.mock('@/hooks/use-v1-bracket-canvas', () => ({ useV1RandomFillSlots: () => ({ mutate: mocks.randomFill, isPending: false }) }));
vi.mock('@/hooks/use-bracket-reset', () => ({ useBracketReset: () => ({ preview: mocks.resetPreview, reset: { mutateAsync: mocks.resetMutate } }) }));
// 대화상자는 각자의 시험이 있다 — 여기서는 어떤 모드로 열리는지만 본다.
vi.mock('./bracket-fixture-tools-dialog', () => ({
  BracketFixtureToolsDialog: (props: { open: boolean; mode: string }) => (props.open ? <div data-testid="tools-dialog" data-mode={props.mode} /> : null),
}));
vi.mock('./bracket-template-dialog', () => ({
  BracketTemplateDialog: (props: { open: boolean; hasExistingBracket: boolean; allowSplitBracket?: boolean }) => (props.open ? <div data-testid="template-dialog" data-existing={String(props.hasExistingBracket)} data-split={String(props.allowSplitBracket === true)} /> : null),
}));
vi.mock('./bracket-standings-fill-dialog', () => ({
  BracketStandingsFillDialog: (props: { onFilled: (result: unknown) => void; teamNames: ReadonlyMap<string, string> }) => (
    <div data-testid="standings-dialog" data-team-names={JSON.stringify([...props.teamNames])}>
      <button type="button" onClick={() => props.onFilled({ assignments: [{ slotId: 's1', registrationId: 'r1' }], skipped: [] })}>채움 성공</button>
    </div>
  ),
}));
vi.mock('./finalist-assignment-dialog', () => ({
  FinalistAssignmentDialog: (props: { supportsRound12: boolean }) => <div data-testid="finalist-dialog" data-round12={String(props.supportsRound12)} />,
}));
vi.mock('./multi-finals-wizard', () => ({
  MultiFinalsWizard: (props: { open: boolean; mode: string }) => (props.open ? <div data-testid="multi-dialog" data-mode={props.mode} /> : null),
}));
vi.mock('@/components/admin/stages/stage-plan-dialog', () => ({
  StagePlanDialog: (props: { open: boolean; canOverride: boolean }) => (props.open ? <div data-testid="stage-dialog" data-override={String(props.canOverride)} /> : null),
}));

const group = makeGroup({ id: 'g-qf', name: '8강', phase: 'quarter' });
const slots = [1, 2, 3, 4].map((n) => makeSlot({ id: `s${n}`, label: `${n}번 자리`, position: n }));
const populated = makeBracket({
  groups: [group],
  slots,
  fixtures: [
    makeFixture({ id: 'f1', groupId: 'g-qf', fixtureNumber: 1, homeSlotId: 's1', awaySlotId: 's2', scheduledAt: '2026-11-20T01:00:00.000Z' }),
    makeFixture({ id: 'f2', groupId: 'g-qf', fixtureNumber: 2, homeSlotId: 's3', awaySlotId: 's4' }),
  ],
});
const registrations = [makeRegistration({ id: 'r1', teamName: '서울FC' }), makeRegistration({ id: 'r2', teamName: '부산FC' }), makeRegistration({ id: 'r3', teamName: '대구FC' })];
const loaded: RegistrationsLoadState = { status: 'success', truncated: false, refetchFailed: false, error: null, onRetry: vi.fn() };
const tournament = (overrides: Partial<V1Tournament> = {}) => ({
  id: 't-1', format: 'knockout', kind: 'regular_tournament', status: 'open', registrationDeadlineAt: '2020-01-01T00:00:00.000Z',
  bracketPublishedAt: null, bracketPublishScheduledAt: null, stagePlan: null, ...overrides,
}) as unknown as V1Tournament;

function setBracket(data: V1AdminTournamentBracket | undefined, isPending = false) {
  Object.assign(mocks.bracket, { data, isPending, refetch: mocks.bracket.refetch });
}

let latest: BracketViewControls;
const extras = { onViewChange: vi.fn(), onAssignmentModeChange: vi.fn(), showToast: vi.fn() };
function Harness(props: { tournament?: V1Tournament; canWrite?: boolean; view?: 'canvas' | 'list'; registrations?: typeof registrations; registrationsState?: RegistrationsLoadState; role?: string }) {
  const controls = useBracketViewControls();
  latest = controls;
  const t = props.tournament ?? tournament();
  const canWrite = props.canWrite ?? true;
  const tools = useBracketTools({
    tournamentId: 't-1', tournament: t, registrations: props.registrations ?? registrations, registrationsState: props.registrationsState ?? loaded,
    canWrite, role: props.role ?? 'PLATFORM_OPS', showToast: extras.showToast, controls, onAssignmentModeChange: extras.onAssignmentModeChange,
  });
  return <BracketToolsBar tools={tools} tournament={t} tournamentId="t-1" canWrite={canWrite} view={props.view ?? 'canvas'} onViewChange={extras.onViewChange}
    controls={controls} showToast={extras.showToast}><p>본문</p></BracketToolsBar>;
}
const renderBar = (props: React.ComponentProps<typeof Harness> = {}) => render(<QueryClientProvider client={new QueryClient()}><Harness {...props} /></QueryClientProvider>);

let restore: (() => void) | null = null;
const at = (width: number) => { restore?.(); restore = installViewport(width); };
beforeEach(() => {
  vi.clearAllMocks();
  setBracket(populated);
  at(1440);
});
afterEach(() => { cleanup(); restore?.(); restore = null; });

const open = (name: string) => fireEvent.click(screen.getByRole('button', { name }));
const item = (name: RegExp | string) => screen.getByRole('menuitem', { name });

describe('BracketToolsBar — 데스크톱', () => {
  it('1440·내용 있음: 보이는 조작은 보기 전환 · 팀 채우기 · 경기 · 시간·구장 · 공개, 합쳐 5개', () => {
    renderBar();
    expect(screen.getByRole('tablist', { name: '대진 보기 방식' })).toBeInTheDocument();
    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual(['팀 채우기', '경기', '시간·구장', '대진 공개']);
  });

  it('「경기」를 열면 경기 추가 · 경기 연결 · 템플릿으로 다시 만들기 · 대진 초기화(빨강)가 설명과 함께 보이고, 경기 추가는 add 로, 경기 연결은 link 로 대화상자를 연다', () => {
    renderBar();
    open('경기');
    expect(screen.getAllByRole('menuitem').map((menuItem) => menuItem.textContent)).toEqual([
      expect.stringMatching(/^경기 추가/), expect.stringMatching(/^경기 연결/), expect.stringMatching(/^템플릿으로 다시 만들기/), expect.stringMatching(/^대진 초기화/),
    ]);
    expect(item(/경기 추가/)).toHaveTextContent('조나 라운드에 경기를 하나 더 만들어요');
    expect(item(/대진 초기화/)).toHaveTextContent('모든 경기와 팀 자리를 지워요');
    expect(screen.getByText('되돌릴 수 없는 작업')).toBeInTheDocument();
    fireEvent.click(item(/경기 추가/));
    expect(screen.getByTestId('tools-dialog')).toHaveAttribute('data-mode', 'add');
    open('경기');
    fireEvent.click(item(/경기 연결/));
    expect(screen.getByTestId('tools-dialog')).toHaveAttribute('data-mode', 'link');
  });

  it('「템플릿으로 다시 만들기」가 교체 모드로 대화상자를 연다', () => {
    renderBar();
    open('경기');
    fireEvent.click(item(/템플릿으로 다시 만들기/));
    expect(screen.getByTestId('template-dialog')).toHaveAttribute('data-existing', 'true');
    expect(screen.getByTestId('template-dialog')).toHaveAttribute('data-split', 'true');
  });

  it('「빈 자리 무작위 채우기」가 randomFill.mutate 를 부르고 채운 수를 토스트로 알린다', () => {
    renderBar();
    open('팀 채우기');
    fireEvent.click(item(/빈 자리 무작위 채우기/));
    expect(mocks.randomFill).toHaveBeenCalledTimes(1);
    act(() => mocks.randomFill.mock.calls[0][1].onSuccess({ assignments: [{ slotId: 's1', registrationId: 'r1' }, { slotId: 's2', registrationId: 'r2' }] }));
    expect(extras.showToast).toHaveBeenCalledWith('2개 자리를 채웠어요.', 'success');
    act(() => mocks.randomFill.mock.calls[0][1].onError(new Error('서버가 거절했어요')));
    expect(extras.showToast).toHaveBeenLastCalledWith('서버가 거절했어요', 'error');
  });

  it.each([
    ['비어 있는 자리가 없어요.', () => setBracket({ ...populated, slots: slots.map((slot, index) => ({ ...slot, registrationId: `r${index + 1}`, teamName: `팀${index + 1}` })) }), undefined],
    ['배정할 수 있는 팀이 없어요.', undefined, { registrations: [] }],
    ['참가팀을 불러오는 중이에요.', undefined, { registrationsState: { ...loaded, status: 'pending' as const } }],
    ['참가팀을 불러오지 못했어요.', undefined, { registrationsState: { ...loaded, status: 'error' as const } }],
  ])('무작위 채우기가 막히면 이유(%s)가 항목 아래에 보이고 누를 수 없다', (reason, prepare, props) => {
    prepare?.();
    renderBar(props);
    open('팀 채우기');
    const random = item(/빈 자리 무작위 채우기/);
    expect(random).toBeDisabled();
    expect(random).toHaveTextContent(reason);
    fireEvent.click(random);
    expect(mocks.randomFill).not.toHaveBeenCalled();
  });

  it('「참가팀 목록 열기」가 controls.trayOpen 을 true 로 바꾼다', () => {
    renderBar();
    open('팀 채우기');
    fireEvent.click(item(/참가팀 목록 열기/));
    expect(latest.trayOpen).toBe(true);
  });

  it('「시간 일괄 배정」·「구장 일괄 배정」이 onAssignmentModeChange 를 time·court 로 부른다', () => {
    renderBar();
    open('시간·구장');
    fireEvent.click(item(/시간 일괄 배정/));
    expect(extras.onAssignmentModeChange).toHaveBeenLastCalledWith('time');
    open('시간·구장');
    fireEvent.click(item(/구장 일괄 배정/));
    expect(extras.onAssignmentModeChange).toHaveBeenLastCalledWith('court');
  });

  it('「시간 미정 경기만 보기」를 켜면 줄 아래 「시간 미정 N경기만 보는 중 · 모두 보기」 칩이 생기고 칩으로 끈다', () => {
    renderBar();
    open('시간·구장');
    expect(item(/시간 미정 경기만 보기/)).toHaveTextContent('1경기가 아직 시간 미정이에요');
    fireEvent.click(item(/시간 미정 경기만 보기/));
    expect(latest.unscheduledOnly).toBe(true);
    expect(screen.getByText('시간 미정 1경기만 보는 중 ·')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '모두 보기' }));
    expect(latest.unscheduledOnly).toBe(false);
    expect(screen.queryByText(/만 보는 중/)).not.toBeInTheDocument();
  });

  it('모든 경기에 시간이 있으면 「시간 미정 경기만 보기」는 이유와 함께 막힌다', () => {
    setBracket({ ...populated, fixtures: populated.fixtures.map((fixture) => ({ ...fixture, scheduledAt: '2026-11-20T01:00:00.000Z' })) });
    renderBar();
    open('시간·구장');
    expect(item(/시간 미정 경기만 보기/)).toBeDisabled();
    expect(item(/시간 미정 경기만 보기/)).toHaveTextContent('모든 경기에 시간이 있어요.');
  });

  it('「대진 초기화」는 확인 창에서 「초기화한다」 입력 뒤에만 reset 을 부른다', async () => {
    mocks.resetPreview.mockResolvedValue({ snapshot: 'snap', fixtureCount: 2, groupCount: 1, canReset: true, blockedReason: null, stageBased: false, preservesPreliminaryGroups: false });
    mocks.resetMutate.mockResolvedValue({ deletedFixtureCount: 2 });
    renderBar();
    open('경기');
    fireEvent.click(item(/대진 초기화/));
    const dialog = await screen.findByRole('dialog', { name: '대진 초기화' });
    expect(mocks.resetMutate).not.toHaveBeenCalled();
    const submit = within(dialog).getByRole('button', { name: '대진 초기화' });
    expect(submit).toBeDisabled();
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: '초기화한다' } });
    fireEvent.click(submit);
    await waitFor(() => expect(mocks.resetMutate).toHaveBeenCalledWith('snap'));
  });

  it('초기화가 막히면 이유가 role=alert 로 줄 아래에 보인다', async () => {
    mocks.resetPreview.mockResolvedValue({ snapshot: 'snap', fixtureCount: 2, groupCount: 1, canReset: false, blockedReason: '기록이 있는 경기는 초기화할 수 없어요.', stageBased: false, preservesPreliminaryGroups: false });
    renderBar();
    open('경기');
    fireEvent.click(item(/대진 초기화/));
    expect(await screen.findByRole('alert')).toHaveTextContent('기록이 있는 경기는 초기화할 수 없어요.');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('group_knockout + 순위 자리: 「조 순위대로 채우기」·「결선 진출팀 직접 정하기」가 대화상자를 연다', () => {
    const groupStage = makeGroup({ id: 'gA', name: 'A조', phase: 'group', groupTeams: [{ id: 'gt1', groupId: 'gA', registrationId: 'r1', teamName: '서울FC', sortOrder: 0, createdAt: '' }, { id: 'gt2', groupId: 'gA', registrationId: null, teamName: null, sortOrder: 1, createdAt: '', isBye: true }] });
    setBracket({ ...populated, groups: [groupStage, group], slots: [...slots, makeSlot({ id: 'rank1', kind: 'GROUP_RANK', label: 'A조 1위', sourceGroupId: 'gA' })] });
    renderBar({ tournament: tournament({ format: 'group_knockout' }) });
    open('팀 채우기');
    fireEvent.click(item(/조 순위대로 채우기/));
    const standings = screen.getByTestId('standings-dialog');
    expect(JSON.parse(standings.getAttribute('data-team-names')!)).toEqual([['r1', '서울FC']]);
    fireEvent.click(screen.getByRole('button', { name: '채움 성공' }));
    expect(extras.showToast).toHaveBeenCalledWith('1개 자리를 순위대로 채웠어요.', 'success');
    open('팀 채우기');
    fireEvent.click(item(/결선 진출팀 직접 정하기/));
    expect(screen.getByTestId('finalist-dialog')).toHaveAttribute('data-round12', 'false');
  });

  it('단계 관리 대회(stagePlan): 「단계·진출팀 관리」 하나가 단계 대화상자를 열고 PLATFORM_OPS 는 덮어쓰기를 허용한다', () => {
    renderBar({ tournament: tournament({ format: 'league_knockouts', stagePlan: { stages: [] } as never }) });
    open('팀 채우기');
    expect(screen.getAllByRole('menuitem')).toHaveLength(1);
    fireEvent.click(item(/단계·진출팀 관리/));
    expect(screen.getByTestId('stage-dialog')).toHaveAttribute('data-override', 'true');
    open('경기');
    expect(screen.getAllByRole('menuitem').map((menuItem) => menuItem.textContent)).toEqual([expect.stringMatching(/^대진 초기화/)]);
  });

  it('옛 league_knockouts: 토너먼트 항목 3개가 같은 마법사를 방식별로 연다', () => {
    renderBar({ tournament: tournament({ format: 'league_knockouts' }) });
    open('팀 채우기');
    fireEvent.click(item(/토너먼트별 진출팀 배정/));
    expect(screen.getByTestId('multi-dialog')).toHaveAttribute('data-mode', 'assign');
    open('팀 채우기');
    fireEvent.click(item(/토너먼트 배정 규칙/));
    expect(screen.getByTestId('multi-dialog')).toHaveAttribute('data-mode', 'rules');
    open('경기');
    fireEvent.click(item(/예선·토너먼트 대진 생성/));
    expect(screen.getByTestId('multi-dialog')).toHaveAttribute('data-mode', 'create');
  });

  it('빈 대진이면 도구 줄이 통째로 없다(본문만 남는다)', () => {
    setBracket(makeBracket());
    renderBar();
    expect(screen.getByText('본문')).toBeInTheDocument();
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('빈 대진의 목록 보기에는 그림으로 돌아가는 전환만 남는다', () => {
    setBracket(makeBracket());
    renderBar({ view: 'list' });
    expect(screen.getByRole('tablist', { name: '대진 보기 방식' })).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: '그림' }));
    expect(extras.onViewChange).toHaveBeenCalledWith('canvas');
  });

  it('불러오는 중에는 보기 전환만 있고 메뉴·공개는 없다', () => {
    setBracket(undefined, true);
    renderBar();
    expect(screen.getByRole('tablist')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('읽기 전용: 보기 전환·공개 상태만', () => {
    renderBar({ canWrite: false, tournament: tournament({ bracketPublishedAt: '2026-10-01T00:00:00.000Z' }) });
    expect(screen.getByRole('tablist')).toBeInTheDocument();
    expect(screen.getByText('공개 중')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByText(/바꾸는 즉시/)).not.toBeInTheDocument();
  });

  it('공개된 대진 + 쓰기 권한: 「이미 공개된 대진표예요. 바꾸는 즉시 참가팀에게 보여요.」 안내', () => {
    renderBar({ tournament: tournament({ bracketPublishedAt: '2026-10-01T00:00:00.000Z' }) });
    expect(screen.getByText('이미 공개된 대진표예요. 바꾸는 즉시 참가팀에게 보여요.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '공개 설정' })).toBeInTheDocument();
  });

  it('보기 전환이 onViewChange 를 부른다', () => {
    renderBar();
    fireEvent.click(screen.getByRole('tab', { name: '목록' }));
    expect(extras.onViewChange).toHaveBeenCalledWith('list');
  });

  it('「대진 공개」가 공개 시트를 연다', () => {
    renderBar();
    open('대진 공개');
    expect(screen.getByRole('dialog', { name: '대진을 공개할까요?' })).toHaveTextContent('8강, 2경기');
  });
});

describe('BracketToolsBar — 폰(390)', () => {
  beforeEach(() => at(390));

  it('메뉴 3개가 한 줄이고 보기 전환이 없으며 공개 막대가 본문 뒤에 따로 있다', () => {
    renderBar();
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    const menus = ['팀 채우기', '경기', '시간·구장'].map((name) => screen.getByRole('button', { name }));
    expect(new Set(menus.map((button) => button.closest('.grid-cols-3')))).toHaveProperty('size', 1);
    expect(menus[0].closest('.grid-cols-3')).toBeInTheDocument();
    const body = screen.getByText('본문');
    const bar = screen.getByRole('button', { name: '대진 공개' }).closest('.sticky')!;
    expect(bar).toBeInTheDocument();
    expect(screen.getByText('참가자에게 아직 대진이 안 보여요')).toBeInTheDocument();
    expect(body.compareDocumentPosition(bar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('메뉴는 시트로 열리고 같은 항목을 고를 수 있다', () => {
    renderBar();
    open('경기');
    const sheet = screen.getByRole('dialog', { name: '경기' });
    fireEvent.click(within(sheet).getByRole('button', { name: /경기 추가/ }));
    expect(screen.getByTestId('tools-dialog')).toHaveAttribute('data-mode', 'add');
  });

  it('폰에서도 경기 연결·템플릿으로 다시 만들기·대진 초기화가 같은 메뉴에 있다', () => {
    renderBar();
    open('경기');
    const sheet = screen.getByRole('dialog', { name: '경기' });
    for (const name of [/경기 연결/, /템플릿으로 다시 만들기/, /대진 초기화/]) expect(within(sheet).getByRole('button', { name })).toBeInTheDocument();
  });

  it('읽기 전용 폰: 메뉴 없이 공개 상태만 본다', () => {
    renderBar({ canWrite: false });
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText('비공개')).toBeInTheDocument();
  });

  it('빈 대진이면 막대도 없다', () => {
    setBracket(makeBracket());
    renderBar();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByText('참가자에게 아직 대진이 안 보여요')).not.toBeInTheDocument();
  });
});
