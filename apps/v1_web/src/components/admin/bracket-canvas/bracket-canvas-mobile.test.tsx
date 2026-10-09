import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { V1ApiError } from '@/lib/api-client';
import { v1Keys } from '@/lib/query-keys';
import { buildBracketMobileRounds, type MobilePickCandidate } from '@/lib/bracket-canvas-mobile-model';
import {
  makeFixture,
  makeGame as buildGame,
  makeGroup as buildGroup,
  makeSlot as buildSlot,
} from '@/test/bracket-canvas-fixtures';
import type { V1AdminBracketFixtureGame, V1AdminBracketSlot, V1TournamentGroupPhase } from '@/types/api';
import { BracketCanvasMobile, type BracketCanvasMobileProps } from './bracket-canvas-mobile';
import type { RegistrationsLoadState } from './bracket-team-tray';

const { assignSlot, quickMutate, updateFixture } = vi.hoisted(() => ({ assignSlot: vi.fn(), quickMutate: vi.fn(), updateFixture: vi.fn() }));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }) }));
vi.mock('@/hooks/use-v1-api', () => ({
  useV1UpdateFixture: () => ({ mutateAsync: updateFixture, isPending: false }),
}));
vi.mock('@/hooks/use-v1-bracket-canvas', () => ({
  useV1AssignTournamentSlot: () => ({ mutateAsync: assignSlot, isPending: false }),
  useV1QuickResult: () => ({ mutate: quickMutate, isPending: false }),
}));
// 폼·액션 내부(검증·확인·정정)는 PR-3 의 테스트가 검증한다. 여기서는 시트가 알맞은 컴포넌트에 알맞은 props 를 넘기고
// 폼의 onSubmit 을 빠른 입력 변이로 이어 주는지만 본다. 폼 mock 의 버튼은 실제 폼처럼 onSubmit 을 호출한다.
vi.mock('./bracket-quick-result-form', () => ({
  BracketQuickResultForm: (props: { homeLabel: string; awayLabel: string; isKnockout: boolean; errorMessage?: string | null; onSubmit: (score: { home: number; away: number }) => void }) => (
    <div data-testid="quick-form" data-knockout={String(props.isKnockout)} data-home={props.homeLabel} data-away={props.awayLabel}>
      {props.errorMessage ? <p role="alert">{props.errorMessage}</p> : null}
      <button type="button" onClick={() => props.onSubmit({ home: 2, away: 1 })}>폼 완료</button>
    </div>
  ),
}));
vi.mock('./bracket-result-actions', () => ({
  BracketResultActions: (props: { showToast: (message: string, variant?: 'success' | 'error') => void; tournamentId: string; fixtureId: string; isKnockout: boolean; canWrite: boolean; game: { id: string; latestRevision: { state: string } | null } }): ReactNode => (
    <div data-testid="result-actions" data-tournament-id={props.tournamentId} data-fixture-id={props.fixtureId} data-game-id={props.game.id} data-can-write={String(props.canWrite)} data-revision-state={props.game.latestRevision?.state ?? ''}>
      <button type="button" onClick={() => props.showToast('결과를 확정했어요.', 'success')}>성공 신호</button>
      <button type="button" onClick={() => props.showToast('확정하지 못했어요.', 'error')}>실패 신호</button>
    </div>
  ),
}));

// 고정 데이터는 PR-3 공용 빌더 위의 얇은 별칭이다 — 이 파일이 자기 빌더를 따로 만들지 않는다.
const slot = (id: string, kind: V1AdminBracketSlot['kind'], label: string, registrationId: string | null, teamName: string | null) =>
  buildSlot({ id, kind, label, registrationId, teamName });

const makeGroup = (id: string, phase: V1TournamentGroupPhase, name: string, sortOrder: number) => buildGroup({ id, phase, name, sortOrder });

const makeGame = (id: string, o: Partial<V1AdminBracketFixtureGame> = {}) => buildGame({ id, ...o });

const revision = (state: string, entryMethod: 'quick' | 'console') => ({
  id: 'rev-1', state, entryMethod, score: { home: 2, away: 1, penalties: { home: 4, away: 3 } },
});

const bothTeams = { homeRegistrationId: 'r3', homeTeamName: '서초FC', awayRegistrationId: 'r4', awayTeamName: '송파FC' };

const groups = [makeGroup('g-q', 'quarter', '8강', 1), makeGroup('g-s', 'semi', '4강', 2), makeGroup('g-f', 'final', '결승', 3)];
const slots = [
  slot('s-h1', 'ENTRY', '1번 자리', 'r1', '강남FC'),
  slot('s-a1', 'ENTRY', '2번 자리', null, null),
  slot('s-x', 'ENTRY', '3번 자리', 'r3', '서초FC'),
  slot('s-bye', 'BYE', '부전승 1', 'r5', '용산FC'),
  slot('s-gr', 'GROUP_RANK', 'A조 1위', null, null),
];
const candidates: MobilePickCandidate[] = [
  { registrationId: 'r1', teamName: '강남FC' },
  { registrationId: 'r2', teamName: '마포FC' },
  { registrationId: 'r3', teamName: '서초FC' },
  { registrationId: 'r4', teamName: '송파FC' },
  { registrationId: 'r5', teamName: '용산FC' },
];
const fixtures = [
  // 한쪽만 찬 예정 경기(자리 연결)
  makeFixture({ id: 'fx-1', groupId: 'g-q', fixtureNumber: 1, homeSlotId: 's-h1', homeRegistrationId: 'r1', homeTeamName: '강남FC', awaySlotId: 's-a1', game: makeGame('g-1') }),
  // 두 팀이 다 찬 예정 경기
  makeFixture({ id: 'fx-2', groupId: 'g-q', fixtureNumber: 2, ...bothTeams, game: makeGame('g-2', { version: 3 }) }),
  // 빠른 입력으로 확정된 경기
  makeFixture({ id: 'fx-3', groupId: 'g-q', fixtureNumber: 3, ...bothTeams, game: makeGame('g-3', { state: 'ENDED', latestRevision: revision('OFFICIAL', 'quick') as never }) }),
  // 라이브 득점 기록이 있는 확정 경기
  makeFixture({ id: 'fx-4', groupId: 'g-q', fixtureNumber: 4, ...bothTeams, game: makeGame('g-4', { state: 'ENDED', hasLiveRecords: true, latestRevision: revision('OFFICIAL', 'console') as never }) }),
  // 콘솔에서 제출돼 확정 대기인 경기
  makeFixture({ id: 'fx-5', groupId: 'g-s', fixtureNumber: 5, ...bothTeams, game: makeGame('g-5', { state: 'ENDED', latestRevision: revision('SUBMITTED', 'console') as never }) }),
  // 조 순위 자리가 걸린 경기
  makeFixture({ id: 'fx-6', groupId: 'g-s', fixtureNumber: 6, homeSlotId: 's-gr', game: makeGame('g-6') }),
  makeFixture({ id: 'fx-9', groupId: 'g-s', fixtureNumber: 9, ...bothTeams, game: makeGame('g-9', { state: 'LIVE' }) }),
  makeFixture({ id: 'fx-7', groupId: 'g-f', fixtureNumber: 7, game: makeGame('g-7') }),
  makeFixture({ id: 'fx-8', groupId: 'g-f', fixtureNumber: 8, status: 'cancelled', game: makeGame('g-8') }),
];

const loaded: RegistrationsLoadState = { status: 'success', truncated: false, refetchFailed: false, error: null, onRetry: vi.fn() };

function renderMobile(overrides: Partial<BracketCanvasMobileProps> = {}, queryClient = new QueryClient()) {
  const showToast = vi.fn();
  const rounds = buildBracketMobileRounds({ groups, fixtures, slots });
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <BracketCanvasMobile competitionId="t-1" scope="tournament" rounds={rounds} slots={slots} candidates={candidates} canWrite registrationsState={loaded} showToast={showToast} {...overrides} />
    </QueryClientProvider>,
  );
  return { showToast, ...utils };
}

const card = (name: RegExp) => screen.getByRole('button', { name });

describe('BracketCanvasMobile — 목록', () => {
  it('끝나지 않은 경기가 있는 첫 라운드를 열고 그 라운드의 칸만 보인다', () => {
    renderMobile();
    expect(screen.getByRole('tab', { name: '8강' })).toHaveAttribute('aria-selected', 'true');
    expect(card(/8강 · 1번 경기/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /4강 · 5번 경기/ })).not.toBeInTheDocument();
  });

  it('탭을 바꾸면 그 라운드의 칸으로 바뀐다', () => {
    renderMobile();
    fireEvent.click(screen.getByRole('tab', { name: '4강' }));
    expect(card(/4강 · 5번 경기/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /8강 · 1번 경기/ })).not.toBeInTheDocument();
  });

  it('칸에는 팀 이름·자리 라벨·미정이 구분되어 나오고 상태는 글자로 적힌다', () => {
    renderMobile();
    const first = within(card(/8강 · 1번 경기/));
    expect(first.getByText('강남FC')).toBeInTheDocument();
    expect(first.getByText('2번 자리')).toBeInTheDocument();
    expect(first.getByText('예정')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: '4강' }));
    expect(within(card(/4강 · 6번 경기/)).getByText('A조 1위')).toBeInTheDocument();
    expect(within(card(/4강 · 6번 경기/)).getByText('미정')).toBeInTheDocument();
    expect(within(card(/4강 · 5번 경기/)).getByText('확정 전')).toBeInTheDocument();
    expect(within(card(/4강 · 9번 경기/)).getByText('진행 중')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: '결승' }));
    expect(within(card(/결승 · 8번 경기/)).getByText('취소')).toBeInTheDocument();
  });

  it('빠른 입력으로 확정된 칸에만 "어드민 빠른 입력"과 점수가 나온다', () => {
    renderMobile();
    expect(screen.getAllByText('어드민 빠른 입력')).toHaveLength(1);
    const quick = within(card(/8강 · 3번 경기/));
    expect(quick.getByText('어드민 빠른 입력')).toBeInTheDocument();
    expect(quick.getByText('2:1 (승부차기 4:3)')).toBeInTheDocument();
    expect(quick.getByText('확정')).toBeInTheDocument();
    // 대조군: 콘솔로 확정된 칸은 점수는 보이지만 빠른 입력 표시는 없다
    expect(within(card(/8강 · 4번 경기/)).queryByText('어드민 빠른 입력')).not.toBeInTheDocument();
  });

  it('편집 권한이 있으면 큰 화면 안내가 보이고 구조 편집 버튼은 하나도 없다', () => {
    renderMobile();
    expect(screen.getByText(/큰 화면에서 편집해요/)).toBeInTheDocument();
    for (const name of [/템플릿/, /경기 추가/, /무작위/, /연결/, /공개/, /삭제/]) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
    }
  });

  it('읽기 전용(canWrite=false)이면 안내 없이 칸만 보인다', () => {
    renderMobile({ canWrite: false });
    expect(screen.queryByText(/큰 화면에서 편집해요/)).not.toBeInTheDocument();
    expect(card(/8강 · 1번 경기/)).toBeInTheDocument();
  });

  it('라운드가 6개 이상이면 탭 대신 셀렉트로 고른다 — 5개 이하(위 테스트들)는 탭', () => {
    const wideGroups = [makeGroup('g-12', 'round12', '12강', 0), ...groups, makeGroup('g-g', 'group', 'A조', -1)];
    const wideFixtures = [
      ...fixtures,
      makeFixture({ id: 'fx-12', groupId: 'g-12', fixtureNumber: 12 }),
      makeFixture({ id: 'fx-g', groupId: 'g-g', fixtureNumber: 20 }),
      makeFixture({ id: 'fx-orphan', groupId: null, fixtureNumber: 30 }),
    ];
    const rounds = buildBracketMobileRounds({ groups: wideGroups, fixtures: wideFixtures, slots });
    expect(rounds).toHaveLength(6);
    renderMobile({ rounds });

    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    const select = screen.getByRole('combobox', { name: '라운드' });
    expect(within(select).getAllByRole('option')).toHaveLength(6);
    fireEvent.change(select, { target: { value: 'etc' } });
    expect(card(/30번 경기/)).toBeInTheDocument();
  });

  it('대진이 비어 있으면 빈 상태를 보여 준다', () => {
    renderMobile({ rounds: [] });
    expect(screen.getByText('아직 대진이 없어요')).toBeInTheDocument();
  });
});

describe('BracketCanvasMobile — 시트', () => {
  const sheet = () => screen.getByRole('dialog');

  beforeEach(() => {
    quickMutate.mockReset();
    quickMutate.mockImplementation((_vars: unknown, options?: { onSuccess?: () => void }) => options?.onSuccess?.());
  });

  it('칸을 누르면 시트가 열리고, 두 팀이 정해진 예정 경기는 점수 폼에 결선 여부·팀 이름을 넘긴다', () => {
    renderMobile();
    expect(card(/8강 · 2번 경기/)).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(card(/8강 · 2번 경기/));

    expect(screen.getByRole('dialog', { name: '8강 · 2번 경기' })).toBeInTheDocument();
    expect(card(/8강 · 2번 경기/)).toHaveAttribute('aria-expanded', 'true');
    const form = screen.getByTestId('quick-form');
    expect(form).toHaveAttribute('data-knockout', 'true');
    expect(form).toHaveAttribute('data-home', '서초FC');
    expect(form).toHaveAttribute('data-away', '송파FC');
  });

  it('폼을 제출하면 그 경기의 게임 id·버전으로 빠른 입력 변이를 부르고, 성공하면 토스트와 함께 시트가 닫힌다', () => {
    const { showToast } = renderMobile();
    fireEvent.click(card(/8강 · 2번 경기/));
    fireEvent.click(screen.getByRole('button', { name: '폼 완료' }));

    expect(quickMutate).toHaveBeenCalledTimes(1);
    expect(quickMutate.mock.calls[0][0]).toEqual({ gameId: 'g-2', expectedVersion: 3, score: { home: 2, away: 1 } });
    expect(showToast).toHaveBeenCalledWith('점수를 확정했어요.');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('빠른 입력이 실패하면 시트를 닫지 않고 폼에 오류 문구를 보여 준다', () => {
    quickMutate.mockImplementation((_vars: unknown, options?: { onError?: (err: unknown) => void }) => options?.onError?.({}));
    renderMobile();
    fireEvent.click(card(/8강 · 2번 경기/));
    fireEvent.click(screen.getByRole('button', { name: '폼 완료' }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(within(sheet()).getByRole('alert')).toHaveTextContent('점수를 확정하지 못했어요');
  });

  it('한쪽 팀이 미정이면 점수 폼 대신 안내만 나온다', () => {
    renderMobile();
    fireEvent.click(card(/8강 · 1번 경기/));
    expect(screen.queryByTestId('quick-form')).not.toBeInTheDocument();
    expect(within(sheet()).getByText('두 팀이 정해지면 점수를 넣을 수 있어요.')).toBeInTheDocument();
  });

  it('확정 전 결과는 확인 액션을 보여 주고 점수 폼은 숨긴다', () => {
    renderMobile();
    fireEvent.click(screen.getByRole('tab', { name: '4강' }));
    fireEvent.click(card(/4강 · 5번 경기/));
    const actions = screen.getByTestId('result-actions');
    expect(actions).toHaveAttribute('data-tournament-id', 't-1');
    expect(actions).toHaveAttribute('data-fixture-id', 'fx-5');
    expect(actions).toHaveAttribute('data-game-id', 'g-5');
    expect(actions).toHaveAttribute('data-can-write', 'true');
    expect(actions).toHaveAttribute('data-revision-state', 'SUBMITTED');
    expect(screen.queryByTestId('quick-form')).not.toBeInTheDocument();
  });

  it('리그에서 결과 확정이 성공하면 리그 경기 목록 캐시도 갱신한다 — 실패 신호와 대회 화면에서는 건드리지 않는다', () => {
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const { showToast } = renderMobile({ scope: 'league', competitionId: 'league-1' }, queryClient);
    fireEvent.click(screen.getByRole('tab', { name: '4강' }));
    fireEvent.click(card(/4강 · 5번 경기/));

    fireEvent.click(screen.getByRole('button', { name: '실패 신호' }));
    expect(showToast).toHaveBeenLastCalledWith('확정하지 못했어요.', 'error');
    expect(invalidate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '성공 신호' }));
    expect(showToast).toHaveBeenLastCalledWith('결과를 확정했어요.', 'success');
    expect(invalidate).toHaveBeenCalledWith({ queryKey: v1Keys.adminLeagueMatch('league-1') });
  });

  it('대회 화면에서는 결과 확정 성공이 리그 캐시를 건드리지 않는다', () => {
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    renderMobile({}, queryClient);
    fireEvent.click(screen.getByRole('tab', { name: '4강' }));
    fireEvent.click(card(/4강 · 5번 경기/));
    fireEvent.click(screen.getByRole('button', { name: '성공 신호' }));
    expect(invalidate).not.toHaveBeenCalled();
  });

  it('빠른 입력으로 확정된 경기는 고치기·무효 액션과 득점자 없음 안내를 보여 준다', () => {
    renderMobile();
    fireEvent.click(card(/8강 · 3번 경기/));
    expect(screen.getByTestId('result-actions')).toHaveAttribute('data-revision-state', 'OFFICIAL');
    expect(within(sheet()).getByText(/득점자는 기록되지 않았어요/)).toBeInTheDocument();
  });

  it('라이브 득점 기록이 있는 확정 경기는 그림에서 고치지 않고 결과 정정 화면으로 보낸다', () => {
    renderMobile();
    fireEvent.click(card(/8강 · 4번 경기/));
    expect(screen.queryByTestId('result-actions')).not.toBeInTheDocument();
    expect(within(sheet()).getByRole('link', { name: /결과 정정 화면으로 가기/ })).toHaveAttribute(
      'href',
      '/admin/live/t-1/records/corrections?fixtureId=fx-4',
    );
  });

  it('진행 중·취소된 경기에는 폼 없이 안내만 나온다', () => {
    renderMobile();
    fireEvent.click(screen.getByRole('tab', { name: '4강' }));
    fireEvent.click(card(/4강 · 9번 경기/));
    expect(within(sheet()).getByText(/라이브 콘솔에서 넣어요/)).toBeInTheDocument();
    expect(screen.queryByTestId('quick-form')).not.toBeInTheDocument();
    expect(screen.queryByTestId('result-actions')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '닫기' }));

    fireEvent.click(screen.getByRole('tab', { name: '결승' }));
    fireEvent.click(card(/결승 · 8번 경기/));
    expect(within(sheet()).getByText('취소된 경기예요.')).toBeInTheDocument();
  });

  it('읽기 전용이면 시트는 열리지만 입력 폼도 액션도 없다(canWrite=true 인 첫 테스트가 대조군)', () => {
    renderMobile({ canWrite: false });
    fireEvent.click(card(/8강 · 2번 경기/));
    expect(sheet()).toBeInTheDocument();
    expect(screen.queryByTestId('quick-form')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '닫기' }));
    fireEvent.click(card(/8강 · 3번 경기/));
    expect(screen.queryByTestId('result-actions')).not.toBeInTheDocument();
  });

  it('점수가 확정돼 시트가 닫히면 그 칸은 더 이상 펼쳐진 상태가 아니다', () => {
    renderMobile();
    fireEvent.click(card(/8강 · 2번 경기/));
    fireEvent.click(screen.getByRole('button', { name: '폼 완료' }));
    expect(card(/8강 · 2번 경기/)).toHaveAttribute('aria-expanded', 'false');
  });

  it('✕ 로 닫으면 시트가 사라진다', () => {
    renderMobile();
    fireEvent.click(card(/8강 · 1번 경기/));
    fireEvent.click(screen.getByRole('button', { name: '닫기' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('BracketCanvasMobile — 사이드 출처 안내', () => {
  it('앞 경기 결과로 채워지는 사이드는 그렇게 안내하고, 자리 연결 사이드에는 안내가 없다', () => {
    const feederFixture = makeFixture({
      id: 'fx-f', groupId: 'g-s', fixtureNumber: 20, ...{ awayRegistrationId: 'r4', awayTeamName: '송파FC' },
      bracketSources: [{ fixtureId: 'fx-2', outcome: 'WINNER', side: 'HOME' }],
    });
    renderMobile({ rounds: buildBracketMobileRounds({ groups, fixtures: [...fixtures, feederFixture], slots }) });
    fireEvent.click(screen.getByRole('tab', { name: '4강' }));
    fireEvent.click(card(/4강 · 20번 경기/));
    expect(within(screen.getByRole('dialog')).getAllByText('이전 경기 결과로 채워져요.')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: '닫기' }));

    fireEvent.click(screen.getByRole('tab', { name: '8강' }));
    fireEvent.click(card(/8강 · 1번 경기/));
    expect(within(screen.getByRole('dialog')).queryByText('이전 경기 결과로 채워져요.')).not.toBeInTheDocument();
  });

  it('팀이 이미 있는 앞 경기 사이드에도 안내를 보인다', () => {
    const feederFixture = makeFixture({
      id: 'fx-f', groupId: 'g-s', fixtureNumber: 20, ...{ homeRegistrationId: 'r3', homeTeamName: '서초FC', awayRegistrationId: 'r4', awayTeamName: '송파FC' },
      bracketSources: [{ fixtureId: 'fx-2', outcome: 'WINNER', side: 'HOME' }],
    });
    renderMobile({ rounds: buildBracketMobileRounds({ groups, fixtures: [...fixtures, feederFixture], slots }) });
    fireEvent.click(screen.getByRole('tab', { name: '4강' }));
    fireEvent.click(card(/4강 · 20번 경기/));
    expect(within(screen.getByRole('dialog')).getAllByText('이전 경기 결과로 채워져요.')).toHaveLength(1);
  });

  it('자리도 앞 경기도 없이 비어 있는 사이드는 직접 지정 경기라고 안내한다', () => {
    renderMobile();
    fireEvent.click(screen.getByRole('tab', { name: '결승' }));
    fireEvent.click(card(/결승 · 7번 경기/));
    expect(within(screen.getByRole('dialog')).getAllByText('경기에 직접 지정하는 자리예요.')).toHaveLength(2);
  });
});

describe('BracketCanvasMobile — 팀 넣기', () => {
  beforeEach(() => {
    assignSlot.mockReset();
    assignSlot.mockResolvedValue({});
    updateFixture.mockReset();
    updateFixture.mockResolvedValue({});
  });

  const optionNames = () =>
    within(screen.getByRole('list', { name: '넣을 수 있는 팀' }))
      .getAllByRole('button')
      .map((button) => button.textContent);

  it('자리에 연결된 사이드에 고르기·바꾸기 버튼이 나오고, 후보에서 이미 다른 ENTRY·BYE 자리에 있는 팀은 빠진다', () => {
    renderMobile();
    fireEvent.click(card(/8강 · 1번 경기/));
    expect(screen.getByRole('button', { name: '홈 팀 바꾸기' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '어웨이 팀 고르기' }));
    // 강남FC(s-h1)·서초FC(s-x)는 ENTRY, 용산FC 는 BYE 자리에 있어 후보가 아니다
    expect(optionNames()).toEqual(['마포FC', '송파FC']);
  });

  it('팀을 고르면 해당 자리로 배정을 요청하고 상세로 돌아온다', async () => {
    const { showToast } = renderMobile();
    fireEvent.click(card(/8강 · 1번 경기/));
    fireEvent.click(screen.getByRole('button', { name: '어웨이 팀 고르기' }));
    fireEvent.click(screen.getByRole('button', { name: '마포FC' }));

    await waitFor(() => expect(assignSlot).toHaveBeenCalledWith({ slotId: 's-a1', registrationId: 'r2' }));
    expect(assignSlot).toHaveBeenCalledTimes(1);
    expect(updateFixture).not.toHaveBeenCalled();
    await waitFor(() => expect(showToast).toHaveBeenCalledWith('팀을 넣었어요.'));
    expect(screen.queryByRole('list', { name: '넣을 수 있는 팀' })).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: '8강 · 1번 경기' })).toBeInTheDocument();
  });

  it('이미 있는 팀을 바꾸는 화면에서는 현재 팀을 비울 수 있고, 현재 팀은 후보에 다시 나오지 않는다', async () => {
    const { showToast } = renderMobile();
    fireEvent.click(card(/8강 · 1번 경기/));
    fireEvent.click(screen.getByRole('button', { name: '홈 팀 바꾸기' }));
    expect(optionNames()).toEqual(['마포FC', '송파FC']);

    fireEvent.click(screen.getByRole('button', { name: '현재 팀 비우기' }));
    await waitFor(() => expect(assignSlot).toHaveBeenCalledWith({ slotId: 's-h1', registrationId: null }));
    await waitFor(() => expect(showToast).toHaveBeenCalledWith('자리를 비웠어요.'));
  });

  it('서버가 거절하면 그림 편집기 공용 안내 문구를 오류 토스트로 보여 주고 고르던 화면에 머문다', async () => {
    assignSlot.mockRejectedValue(
      new V1ApiError({
        statusCode: 409, code: 'SLOT_TEAM_ALREADY_PLACED', message: '서버 원문이에요.', details: null, requestId: 'req-1', timestamp: '2026-10-08T00:00:00.000Z',
      } as unknown as ConstructorParameters<typeof V1ApiError>[0]),
    );
    const { showToast } = renderMobile();
    fireEvent.click(card(/8강 · 1번 경기/));
    fireEvent.click(screen.getByRole('button', { name: '어웨이 팀 고르기' }));
    fireEvent.click(screen.getByRole('button', { name: '송파FC' }));

    await waitFor(() => expect(showToast).toHaveBeenCalledWith('이미 다른 자리에 들어간 팀이에요.', 'error'));
    expect(screen.getByRole('list', { name: '넣을 수 있는 팀' })).toBeInTheDocument();
  });

  it('후보가 하나도 없으면 안내를 보여 준다', () => {
    renderMobile({ candidates: [] });
    fireEvent.click(card(/8강 · 1번 경기/));
    fireEvent.click(screen.getByRole('button', { name: '어웨이 팀 고르기' }));
    expect(screen.getByText(/넣을 수 있는 팀이 없어요/)).toBeInTheDocument();
  });

  it('자리 없이 직접 지정한 사이드는 경기를 고쳐 저장하고, 반대편 팀은 후보에서 뺀다', async () => {
    const { showToast } = renderMobile();
    // fx-2: 홈 서초FC(r3)·어웨이 송파FC(r4), 자리 연결 없음 — 자리 후보 필터(ENTRY 배치)는 적용되지 않는다
    fireEvent.click(card(/8강 · 2번 경기/));
    fireEvent.click(screen.getByRole('button', { name: '홈 팀 바꾸기' }));
    expect(optionNames()).toEqual(['강남FC', '마포FC', '용산FC']);

    fireEvent.click(screen.getByRole('button', { name: '마포FC' }));
    await waitFor(() => expect(updateFixture).toHaveBeenCalledWith({ fixtureId: 'fx-2', homeRegistrationId: 'r2' }));
    expect(assignSlot).not.toHaveBeenCalled();
    await waitFor(() => expect(showToast).toHaveBeenCalledWith('팀을 넣었어요.'));
  });

  it('직접 지정 어웨이 팀을 비우면 어웨이 필드만 null 로 보낸다', async () => {
    renderMobile();
    fireEvent.click(card(/8강 · 2번 경기/));
    fireEvent.click(screen.getByRole('button', { name: '어웨이 팀 바꾸기' }));
    fireEvent.click(screen.getByRole('button', { name: '현재 팀 비우기' }));
    await waitFor(() => expect(updateFixture).toHaveBeenCalledWith({ fixtureId: 'fx-2', awayRegistrationId: null }));
  });

  it('참가팀 조회가 끝나기 전에는 고르기를 막고, 실패하면 다시 시도를 보여 준다', () => {
    const onRetry = vi.fn();
    const { unmount } = renderMobile({ registrationsState: { ...loaded, status: 'pending' } });
    fireEvent.click(card(/8강 · 1번 경기/));
    fireEvent.click(screen.getByRole('button', { name: '어웨이 팀 고르기' }));
    expect(screen.getByText('참가팀을 불러오는 중이에요.')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: '넣을 수 있는 팀' })).not.toBeInTheDocument();
    expect(screen.queryByText(/넣을 수 있는 팀이 없어요/)).not.toBeInTheDocument();
    unmount();

    renderMobile({ registrationsState: { ...loaded, status: 'error', error: new Error('x'), onRetry } });
    fireEvent.click(card(/8강 · 1번 경기/));
    fireEvent.click(screen.getByRole('button', { name: '홈 팀 바꾸기' }));
    expect(screen.getByRole('button', { name: '현재 팀 비우기' })).toBeDisabled();
    expect(screen.queryByText(/넣을 수 있는 팀이 없어요/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('재조회가 실패해도 캐시된 목록은 쓰되 오류·다시 시도·이전 목록 안내를 함께 보인다', () => {
    const onRetry = vi.fn();
    renderMobile({ registrationsState: { ...loaded, refetchFailed: true, error: new Error('x'), onRetry } });
    fireEvent.click(card(/8강 · 2번 경기/));
    fireEvent.click(screen.getByRole('button', { name: '홈 팀 바꾸기' }));
    expect(optionNames()).toEqual(['강남FC', '마포FC', '용산FC']);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('이전에 불러온 목록이에요.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('재조회가 실패했고 캐시 목록도 비었으면 "팀이 없어요" 대신 오류와 다시 시도만 보인다', () => {
    const onRetry = vi.fn();
    renderMobile({ candidates: [], registrationsState: { ...loaded, refetchFailed: true, error: new Error('x'), onRetry } });
    fireEvent.click(card(/8강 · 2번 경기/));
    fireEvent.click(screen.getByRole('button', { name: '홈 팀 바꾸기' }));
    expect(screen.queryByText(/넣을 수 있는 팀이 없어요/)).not.toBeInTheDocument();
    expect(screen.queryByText('이전에 불러온 목록이에요.')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('참가팀이 상한에 걸려 일부만 불러왔으면 그렇게 알린다 — 아니면 알리지 않는다', () => {
    const { unmount } = renderMobile({ registrationsState: { ...loaded, truncated: true } });
    fireEvent.click(card(/8강 · 2번 경기/));
    fireEvent.click(screen.getByRole('button', { name: '홈 팀 바꾸기' }));
    expect(screen.getByText('참가팀이 많아 일부만 불러왔어요.')).toBeInTheDocument();
    unmount();
    renderMobile();
    fireEvent.click(card(/8강 · 2번 경기/));
    fireEvent.click(screen.getByRole('button', { name: '홈 팀 바꾸기' }));
    expect(screen.queryByText('참가팀이 많아 일부만 불러왔어요.')).not.toBeInTheDocument();
  });

  it('고르기 버튼이 없어야 하는 곳 — 조 순위 자리·앞 경기 결과 사이드·시작된 경기·읽기 전용', () => {
    const settled = makeFixture({
      id: 'fx-10', groupId: 'g-q', fixtureNumber: 10, homeSlotId: 's-x', homeRegistrationId: 'r3', homeTeamName: '서초FC',
      awayRegistrationId: 'r4', awayTeamName: '송파FC',
      game: makeGame('g-10', { state: 'ENDED', latestRevision: revision('OFFICIAL', 'console') as never }),
    });
    const feederFixture = makeFixture({
      id: 'fx-f', groupId: 'g-q', fixtureNumber: 20, awayRegistrationId: 'r4', awayTeamName: '송파FC',
      bracketSources: [{ fixtureId: 'fx-2', outcome: 'WINNER', side: 'HOME' }],
    });
    const rounds = buildBracketMobileRounds({ groups, fixtures: [...fixtures, settled, feederFixture], slots });
    const { unmount } = renderMobile({ rounds });

    // 조 순위 자리: 버튼 대신 안내
    fireEvent.click(screen.getByRole('tab', { name: '4강' }));
    fireEvent.click(card(/4강 · 6번 경기/));
    expect(screen.queryByRole('button', { name: /^홈 팀 (고르기|바꾸기)/ })).not.toBeInTheDocument();
    expect(screen.getByText(/큰 화면에서 순위대로 채워요/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '닫기' }));

    // 앞 경기 결과 사이드(홈)는 버튼이 없고 직접 지정 사이드(어웨이 송파FC)에만 있다
    fireEvent.click(screen.getByRole('tab', { name: '8강' }));
    fireEvent.click(card(/8강 · 20번 경기/));
    expect(screen.queryByRole('button', { name: '홈 팀 고르기' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '어웨이 팀 바꾸기' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '닫기' }));

    // 시작된 경기(fx-10, 자리 연결이 있어도)
    fireEvent.click(card(/8강 · 10번 경기/));
    expect(screen.queryByRole('button', { name: /팀 (고르기|바꾸기)/ })).not.toBeInTheDocument();
    unmount();

    // 읽기 전용: 같은 fx-1 이 canWrite=true 일 때(위 테스트들)는 버튼이 있었다
    renderMobile({ canWrite: false });
    fireEvent.click(card(/8강 · 1번 경기/));
    expect(screen.queryByRole('button', { name: /팀 (고르기|바꾸기)/ })).not.toBeInTheDocument();
  });
});
