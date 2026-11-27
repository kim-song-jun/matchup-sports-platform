import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installViewport } from '@/test/viewport';
import { makeBracket, makeFixture, makeGroup, makeRegistration, makeSlot } from '@/test/bracket-canvas-fixtures';
import type { V1Tournament } from '@/types/api';
import { BracketCanvasWorkspace } from './bracket-canvas-workspace';
import type { RegistrationsLoadState } from './bracket-team-tray';
import { useBracketTools } from './use-bracket-tools';
import { useBracketViewControls } from './use-bracket-view-controls';

// 진짜 `useBracketTools` + 진짜 `BracketCanvasWorkspace` 를 한 화면에 엮는다. 목은 네트워크 훅·대화상자(열림 요청을 흉내 내려고 props 만 붙잡음)·칸 패널뿐이다.
vi.mock('next/navigation', () => ({ usePathname: () => '/admin/tournaments/t-1/bracket', useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }) }));

const mocks = vi.hoisted(() => ({
  bracket: { data: undefined as unknown, isPending: false, isError: false, error: null as unknown, refetch: vi.fn() },
  tools: null as null | { onFixtureCreated: (id: string) => void },
  template: null as null | { onApplied: () => void },
}));
vi.mock('@/hooks/use-v1-api', () => ({
  useV1AdminBracket: () => mocks.bracket,
  useV1UpdateFixture: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('@/hooks/use-v1-bracket-canvas', () => ({
  useV1AssignTournamentSlot: () => ({ mutate: vi.fn(), isPending: false }),
  useV1RandomFillSlots: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('@/hooks/use-bracket-reset', () => ({ useBracketReset: () => ({ preview: vi.fn(), reset: { mutateAsync: vi.fn() } }) }));
vi.mock('./bracket-node-panel', () => ({
  BracketNodePanel: (props: { fixture: { id: string } }) => <aside data-testid="panel">{props.fixture.id}</aside>,
}));
vi.mock('./bracket-fixture-tools-dialog', () => ({ BracketFixtureToolsDialog: (props: NonNullable<typeof mocks.tools>) => { mocks.tools = props; return null; } }));
vi.mock('./bracket-template-dialog', () => ({ BracketTemplateDialog: (props: NonNullable<typeof mocks.template>) => { mocks.template = props; return null; } }));
vi.mock('./bracket-standings-fill-dialog', () => ({ BracketStandingsFillDialog: () => null }));
vi.mock('./finalist-assignment-dialog', () => ({ FinalistAssignmentDialog: () => null }));
vi.mock('./multi-finals-wizard', () => ({ MultiFinalsWizard: () => null }));
vi.mock('@/components/admin/stages/stage-plan-dialog', () => ({ StagePlanDialog: () => null }));

const group = makeGroup({ id: 'g-qf', name: '8강', phase: 'quarter' });
const slots = [1, 2, 3, 4].map((n) => makeSlot({ id: `s${n}`, label: `${n}번 자리`, position: n }));
const bracket = makeBracket({
  groups: [group],
  slots,
  fixtures: [
    makeFixture({ id: 'f2', groupId: 'g-qf', fixtureNumber: 2, homeSlotId: 's3', awaySlotId: 's4' }),
    makeFixture({ id: 'f1', groupId: 'g-qf', fixtureNumber: 1, homeSlotId: 's1', awaySlotId: 's2' }),
  ],
});
const registrations = [makeRegistration({ id: 'r1', teamName: '서울FC' })];
const registrationsState: RegistrationsLoadState = { status: 'success', truncated: false, refetchFailed: false, error: null, onRetry: vi.fn() };
const tournament = { id: 't-1', format: 'knockout', kind: 'regular_tournament', status: 'open', stagePlan: null } as unknown as V1Tournament;

type View = 'canvas' | 'list';
function Screen({ view }: { view: View }) {
  const controls = useBracketViewControls();
  const tools = useBracketTools({
    tournamentId: 't-1', tournament, registrations, registrationsState, canWrite: true, role: 'PLATFORM_OPS',
    showToast: vi.fn(), controls, view, onAssignmentModeChange: vi.fn(),
  });
  return <>
    {tools.dialogs}
    {view === 'canvas'
      ? <BracketCanvasWorkspace tournamentId="t-1" format="knockout" registrations={registrations} registrationsState={registrationsState} canWrite showToast={vi.fn()} controls={controls} />
      : <div data-testid="list" />}
  </>;
}
// 두 화면 사이에서 제어 상태가 이어지도록 같은 컴포넌트를 다시 그린다(페이지가 보기만 바꾸는 것과 같다).
function mount(view: View) {
  const client = new QueryClient();
  const ui = (next: View) => <QueryClientProvider client={client}><Screen view={next} /></QueryClientProvider>;
  const utils = render(ui(view));
  return { switchTo: (next: View) => utils.rerender(ui(next)) };
}

let restore: (() => void) | null = null;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.tools = null;
  mocks.template = null;
  Object.assign(mocks.bracket, { data: bracket, isPending: false, isError: false, error: null, refetch: vi.fn().mockResolvedValue({ data: bracket }) });
  restore = installViewport(1440);
});
afterEach(() => { cleanup(); restore?.(); });

describe('경기 열기 요청은 그림 보기에서 낸 것만 그림이 연다', () => {
  it('그림 보기에서 새 경기를 만들면 그 경기의 패널이 열린다', () => {
    mount('canvas');
    expect(screen.queryByTestId('panel')).not.toBeInTheDocument();
    act(() => mocks.tools!.onFixtureCreated('f2'));
    expect(screen.getByTestId('panel')).toHaveTextContent('f2');
  });

  it('목록 보기에서 만든 경기는 나중에 그림으로 돌아와도 패널을 열지 않는다', () => {
    const view = mount('list');
    act(() => mocks.tools!.onFixtureCreated('f2'));
    view.switchTo('canvas');
    expect(screen.getByTestId('bracket-canvas-area')).toBeInTheDocument();
    expect(screen.queryByTestId('panel')).not.toBeInTheDocument();
  });

  it('그림에서 템플릿을 적용하면 번호가 가장 앞선 경기가 열린다', async () => {
    mount('canvas');
    await act(async () => { mocks.template!.onApplied(); });
    expect(screen.getByTestId('panel')).toHaveTextContent('f1');
  });

  it('목록에서 템플릿을 적용하면 그림으로 돌아와도 패널이 열리지 않는다', async () => {
    const view = mount('list');
    await act(async () => { mocks.template!.onApplied(); });
    view.switchTo('canvas');
    expect(screen.queryByTestId('panel')).not.toBeInTheDocument();
  });

  it('그림에서 적용을 시작하고 대진을 다시 읽는 동안 목록으로 옮겨 가면 요청을 내지 않는다', async () => {
    let finish: (value: { data: unknown }) => void = () => {};
    mocks.bracket.refetch.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    const view = mount('canvas');
    act(() => mocks.template!.onApplied());
    view.switchTo('list');
    await act(async () => { finish({ data: bracket }); });
    view.switchTo('canvas');
    expect(screen.queryByTestId('panel')).not.toBeInTheDocument();
  });
});
