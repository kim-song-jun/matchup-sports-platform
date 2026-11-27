import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeBracket, makeFixture, makeGroup, makeRegistration, makeSlot } from '@/test/bracket-canvas-fixtures';
import type { V1AdminTournamentBracket, V1Tournament } from '@/types/api';
import type { RegistrationsLoadState } from './bracket-team-tray';
import { useBracketTools, type UseBracketToolsInput } from './use-bracket-tools';
import type { BracketViewControls } from './use-bracket-view-controls';

const mocks = vi.hoisted(() => ({
  bracket: { data: undefined as unknown, isPending: false, refetch: vi.fn() },
  randomFill: vi.fn(),
  template: null as null | { onApplied: () => void; format: string; open: boolean },
  tools: null as null | { onFixtureCreated: (id: string) => void; open: boolean; mode: string },
  multi: null as null | { onApplied: () => void; mode: string; open: boolean },
}));
vi.mock('@/hooks/use-v1-api', () => ({ useV1AdminBracket: () => mocks.bracket }));
vi.mock('@/hooks/use-v1-bracket-canvas', () => ({ useV1RandomFillSlots: () => ({ mutate: mocks.randomFill, isPending: false }) }));
vi.mock('@/hooks/use-bracket-reset', () => ({ useBracketReset: () => ({ preview: vi.fn(), reset: { mutateAsync: vi.fn() } }) }));
vi.mock('./bracket-fixture-tools-dialog', () => ({ BracketFixtureToolsDialog: (props: NonNullable<typeof mocks.tools>) => { mocks.tools = props; return null; } }));
vi.mock('./bracket-template-dialog', () => ({ BracketTemplateDialog: (props: NonNullable<typeof mocks.template>) => { mocks.template = props; return null; } }));
vi.mock('./multi-finals-wizard', () => ({ MultiFinalsWizard: (props: NonNullable<typeof mocks.multi>) => { mocks.multi = props; return null; } }));
vi.mock('./bracket-standings-fill-dialog', () => ({ BracketStandingsFillDialog: () => null }));
vi.mock('./finalist-assignment-dialog', () => ({ FinalistAssignmentDialog: () => null }));
vi.mock('@/components/admin/stages/stage-plan-dialog', () => ({ StagePlanDialog: () => null }));

const group = makeGroup({ id: 'g-qf', name: '8강', phase: 'quarter' });
const slots = [1, 2, 3, 4].map((n) => makeSlot({ id: `s${n}`, label: `${n}번 자리`, position: n }));
const populated = makeBracket({
  groups: [group],
  slots,
  fixtures: [
    makeFixture({ id: 'f2', groupId: 'g-qf', fixtureNumber: 2, homeSlotId: 's3', awaySlotId: 's4' }),
    makeFixture({ id: 'f1', groupId: 'g-qf', fixtureNumber: 1, homeSlotId: 's1', awaySlotId: 's2', scheduledAt: '2026-11-20T01:00:00.000Z' }),
  ],
});
const registrations = [makeRegistration({ id: 'r1', teamName: '서울FC' }), makeRegistration({ id: 'r2', teamName: '부산FC' })];
const loaded: RegistrationsLoadState = { status: 'success', truncated: false, refetchFailed: false, error: null, onRetry: vi.fn() };
const tournament = (overrides: Partial<V1Tournament> = {}) => ({ id: 't-1', format: 'knockout', kind: 'regular_tournament', status: 'open', stagePlan: null, ...overrides }) as unknown as V1Tournament;
const controlsOf = (overrides: Partial<BracketViewControls> = {}): BracketViewControls => ({
  trayOpen: null, setTrayOpen: vi.fn(), unscheduledOnly: false, setUnscheduledOnly: vi.fn(), focusRequest: null, requestFocus: vi.fn(), clearFocusRequest: vi.fn(), ...overrides,
});

function setBracket(data: V1AdminTournamentBracket | undefined, isPending = false) {
  Object.assign(mocks.bracket, { data, isPending });
}
const showToast = vi.fn();
const onAssignmentModeChange = vi.fn();
function setup(overrides: Partial<UseBracketToolsInput> = {}) {
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;
  const input: UseBracketToolsInput = {
    tournamentId: 't-1', tournament: tournament(), registrations, registrationsState: loaded, canWrite: true, role: 'PLATFORM_OPS',
    showToast, controls: controlsOf(), view: 'canvas', onAssignmentModeChange, ...overrides,
  };
  const hook = renderHook(() => useBracketTools(input), { wrapper });
  render(<QueryClientProvider client={new QueryClient()}>{hook.result.current.dialogs}</QueryClientProvider>);
  return { ...hook, input };
}
const keys = (actions: Array<{ key: string }>) => actions.map((action) => action.key);
const action = (actions: Array<{ key: string; onSelect?: () => void }>, key: string) => actions.find((candidate) => candidate.key === key)!;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.template = mocks.tools = mocks.multi = null;
  setBracket(populated);
});
afterEach(() => cleanup());

describe('useBracketTools — 대진 상태에서 계산하는 값', () => {
  it('내용·요약·시간 미정 경기 수', () => {
    const { result } = setup();
    expect(result.current).toMatchObject({ loading: false, isEmpty: false, hasGroups: true, summary: '8강, 2경기', unscheduledCount: 1, resetError: null });
  });

  it('불러오는 중에는 loading 이고 메뉴가 비며 비었다고 보지 않는다', () => {
    setBracket(undefined, true);
    const { result } = setup();
    expect(result.current.loading).toBe(true);
    expect(result.current.isEmpty).toBe(false);
    expect(result.current.menus).toEqual({ teamFill: [], match: [], timeVenue: [] });
  });

  it('조도 경기도 없으면 isEmpty, 메뉴가 비고 만들기 길(create)만 남는다', () => {
    setBracket(makeBracket());
    const { result } = setup();
    expect(result.current).toMatchObject({ isEmpty: true, hasGroups: false, menus: { teamFill: [], match: [], timeVenue: [] } });
    expect(result.current.create).toEqual({ key: 'template', label: '템플릿으로 대진 만들기' });
  });

  it('읽기 전용이면 메뉴도 만들기 길도 없다', () => {
    const { result } = setup({ canWrite: false });
    expect(result.current.menus).toEqual({ teamFill: [], match: [], timeVenue: [] });
    expect(result.current.create).toBeNull();
  });

  it.each([
    ['knockout', { format: 'knockout' }, 'template'],
    ['단계 관리', { format: 'league_knockouts', stagePlan: { stages: [] } }, 'stage'],
    ['옛 league_knockouts', { format: 'league_knockouts' }, 'multi-finals-create'],
  ] as const)('%s 대회의 만들기 길', (_name, overrides, key) => {
    setBracket(makeBracket());
    const { result } = setup({ tournament: tournament(overrides as unknown as Partial<V1Tournament>) });
    expect(result.current.create?.key).toBe(key);
  });
});

describe('useBracketTools — 메뉴 항목', () => {
  it('knockout 의 세 메뉴 항목', () => {
    const { result } = setup();
    expect(keys(result.current.menus.teamFill)).toEqual(['random-fill', 'team-tray']);
    expect(keys(result.current.menus.match)).toEqual(['add-fixture', 'link-fixtures', 'template', 'reset']);
    expect(keys(result.current.menus.timeVenue)).toEqual(['time-assign', 'court-assign', 'unscheduled-only']);
  });

  it('막힌 항목은 disabled 와 disabledReason 을 함께 싣는다', () => {
    const { result } = setup({ registrations: [] });
    expect(action(result.current.menus.teamFill, 'random-fill')).toMatchObject({ disabled: true, disabledReason: '배정할 수 있는 팀이 없어요.' });
    expect(action(result.current.menus.match, 'add-fixture')).toMatchObject({ disabled: false });
  });

  it('대회 방식을 모르면 경기 추가·연결이 이유와 함께 막힌다', () => {
    const { result } = setup({ tournament: undefined });
    for (const key of ['add-fixture', 'link-fixtures']) {
      expect(action(result.current.menus.match, key)).toMatchObject({ disabled: true, disabledReason: expect.stringContaining('대회 방식을 아직 확인하지 못해') });
    }
  });

  it('목록 보기에서는 「참가팀 목록 열기」를 내지 않는다(눌러도 보일 트레이가 없다)', () => {
    const { result } = setup({ view: 'list' });
    expect(keys(result.current.menus.teamFill)).toEqual(['random-fill']);
  });

  it('참가팀 목록 열기의 설명은 참가팀 트레이의 미배정 수와 같다(경기에 직접 넣은 팀은 뺀다)', () => {
    setBracket(makeBracket({ groups: [group], fixtures: [makeFixture({ id: 'f1', groupId: 'g-qf', fixtureNumber: 1, homeRegistrationId: 'r1', homeTeamName: '서울FC' })] }));
    const { result } = setup();
    expect(action(result.current.menus.teamFill, 'team-tray')).toMatchObject({ description: '팀을 골라 자리에 넣어요 · 자리 없는 팀 1' });
  });
});

describe('useBracketTools — 항목을 고르면', () => {
  it('참가팀 목록 열기 → controls.setTrayOpen(true)', () => {
    const controls = controlsOf();
    const { result } = setup({ controls });
    act(() => action(result.current.menus.teamFill, 'team-tray').onSelect?.());
    expect(controls.setTrayOpen).toHaveBeenCalledWith(true);
  });

  it('시간·구장 일괄 배정 → onAssignmentModeChange(time|court)', () => {
    const { result } = setup();
    act(() => action(result.current.menus.timeVenue, 'time-assign').onSelect?.());
    expect(onAssignmentModeChange).toHaveBeenLastCalledWith('time');
    act(() => action(result.current.menus.timeVenue, 'court-assign').onSelect?.());
    expect(onAssignmentModeChange).toHaveBeenLastCalledWith('court');
  });

  it('시간 미정 경기만 보기는 지금 값을 뒤집는다', () => {
    const on = controlsOf({ unscheduledOnly: true });
    const { result } = setup({ controls: on });
    expect(action(result.current.menus.timeVenue, 'unscheduled-only')).toMatchObject({ label: '모든 경기 보기' });
    act(() => action(result.current.menus.timeVenue, 'unscheduled-only').onSelect?.());
    expect(on.setUnscheduledOnly).toHaveBeenCalledWith(false);
  });

  it('경기 추가·연결 대화상자가 열리고, 새 경기가 만들어지면 그 경기를 열어 달라고 요청한다', () => {
    const controls = controlsOf();
    const { result, rerender } = setup({ controls });
    expect(mocks.tools).toMatchObject({ open: false });
    act(() => action(result.current.menus.match, 'add-fixture').onSelect?.());
    rerender();
    render(<QueryClientProvider client={new QueryClient()}>{result.current.dialogs}</QueryClientProvider>);
    expect(mocks.tools).toMatchObject({ open: true, mode: 'add' });
    mocks.tools!.onFixtureCreated('new-fixture');
    expect(controls.requestFocus).toHaveBeenCalledWith('new-fixture');
  });

  it('템플릿 적용이 끝나면 번호가 가장 앞선 경기를 열어 달라고 요청한다', async () => {
    const controls = controlsOf();
    mocks.bracket.refetch.mockResolvedValue({ data: populated });
    setup({ controls });
    mocks.template!.onApplied();
    await vi.waitFor(() => expect(controls.requestFocus).toHaveBeenCalledWith('f1'));
  });

  it('템플릿 적용 뒤 경기가 하나도 없으면 아무것도 요청하지 않는다', async () => {
    const controls = controlsOf();
    mocks.bracket.refetch.mockResolvedValue({ data: makeBracket() });
    setup({ controls });
    mocks.template!.onApplied();
    await Promise.resolve();
    expect(controls.requestFocus).not.toHaveBeenCalled();
  });

  it.each([
    ['multi-finals-assign', 'assign', '진출팀을 대진에 배정했어요.'],
    ['multi-finals-rules', 'rules', '토너먼트 배정 규칙을 저장했어요.'],
  ] as const)('옛 league_knockouts 의 %s 는 마법사를 %s 방식으로 열고 끝나면 안내한다', (key, mode, message) => {
    const { result, rerender } = setup({ tournament: tournament({ format: 'league_knockouts' }) });
    act(() => action(result.current.menus.teamFill, key).onSelect?.());
    rerender();
    render(<QueryClientProvider client={new QueryClient()}>{result.current.dialogs}</QueryClientProvider>);
    expect(mocks.multi).toMatchObject({ open: true, mode });
    mocks.multi!.onApplied();
    expect(showToast).toHaveBeenCalledWith(message, 'success');
  });

  it('openCreate 가 만들기 길의 대화상자를 연다(빈 대진의 템플릿)', () => {
    setBracket(makeBracket());
    const { result, rerender } = setup();
    expect(mocks.template).toMatchObject({ open: false });
    act(() => result.current.openCreate());
    rerender();
    render(<QueryClientProvider client={new QueryClient()}>{result.current.dialogs}</QueryClientProvider>);
    expect(mocks.template).toMatchObject({ open: true });
  });
});
