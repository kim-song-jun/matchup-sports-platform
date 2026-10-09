/**
 * 시트가 열린 채 뒤로가기 → 시트만 닫히고 대진 화면에 남는다. 이 테스트가 잡는 버그: 뒤로가기가 시트를 건너뛰고
 * 화면을 떠나는 것, 시트를 ✕·폼 완료로 닫은 뒤 히스토리 항목이 남아 다음 뒤로가기가 헛도는 것.
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildBracketMobileRounds } from '@/lib/bracket-canvas-mobile-model';
import { __resetNavigationHistoryForTests, installNavigationHistory, subscribeAppPop } from '@/lib/navigation-history';
import { __resetOverlayHistoryForTests, overlayMarkerOf } from '@/lib/overlay-history';
import { currentPath, settleHistory } from '@/test/history-router';
import { makeFixture, makeGame, makeGroup, makeSlot } from '@/test/bracket-canvas-fixtures';
import { BracketCanvasMobile } from './bracket-canvas-mobile';
import type { RegistrationsLoadState } from './bracket-team-tray';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }) }));
vi.mock('@/hooks/use-v1-api', () => ({
  useV1UpdateFixture: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('@/hooks/use-v1-bracket-canvas', () => ({
  useV1AssignTournamentSlot: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useV1QuickResult: () => ({ mutate: (_vars: unknown, options?: { onSuccess?: () => void }) => options?.onSuccess?.(), isPending: false }),
}));
vi.mock('./bracket-quick-result-form', () => ({
  BracketQuickResultForm: (props: { onSubmit: (score: { home: number; away: number }) => void }) => (
    <button type="button" onClick={() => props.onSubmit({ home: 1, away: 0 })}>폼 완료</button>
  ),
}));
vi.mock('./bracket-result-actions', () => ({ BracketResultActions: () => null }));

const BRACKET_PATH = '/admin/tournaments/t-1/bracket';
const nextRouterPop = vi.fn();
const appPop = vi.fn();
const loaded: RegistrationsLoadState = { status: 'success', truncated: false, refetchFailed: false, error: null, onRetry: vi.fn() };

const group = makeGroup({ id: 'g-q', phase: 'quarter', name: '8강', sortOrder: 1 });
const slots = [makeSlot({ id: 's-1', label: '1번 자리' })];
const fixtures = [
  // 자리만 걸린 빈 경기 — 팀 고르기 화면용
  makeFixture({ id: 'fx-1', groupId: 'g-q', fixtureNumber: 1, homeSlotId: 's-1', awayRegistrationId: 'r2', awayTeamName: 'B팀', game: makeGame({ id: 'g-1' }) }),
  // 두 팀이 다 찬 경기 — 점수 폼(폼 완료)용
  makeFixture({
    id: 'fx-2', groupId: 'g-q', fixtureNumber: 2, homeRegistrationId: 'r1', homeTeamName: 'A팀', awayRegistrationId: 'r2', awayTeamName: 'B팀', game: makeGame({ id: 'g-2' }),
  }),
];

beforeEach(() => {
  __resetOverlayHistoryForTests();
  __resetNavigationHistoryForTests();
  window.sessionStorage.clear();
  window.history.replaceState(null, '', '/home');
  installNavigationHistory();
  window.history.pushState({}, '', BRACKET_PATH);
  window.addEventListener('popstate', nextRouterPop);
  subscribeAppPop(appPop);
  render(
    <BracketCanvasMobile
      competitionId="t-1"
      scope="tournament"
      rounds={buildBracketMobileRounds({ groups: [group], fixtures, slots })}
      slots={slots}
      candidates={[{ registrationId: 'r1', teamName: 'A팀' }]}
      canWrite
      registrationsState={loaded}
      showToast={vi.fn()}
    />,
  );
});
afterEach(() => {
  window.removeEventListener('popstate', nextRouterPop);
  __resetOverlayHistoryForTests();
  __resetNavigationHistoryForTests();
  vi.clearAllMocks();
});

const back = async () => {
  await act(async () => {
    window.history.back();
    await settleHistory();
  });
};
const openCard = (name: RegExp) => fireEvent.click(screen.getByRole('button', { name }));
const sheetOpen = () => screen.queryByRole('dialog') !== null;

describe('대진 모바일 시트 — 뒤로가기', () => {
  it('시트가 열린 채 뒤로가기를 누르면 시트만 닫히고 대진 화면에 남는다', async () => {
    openCard(/8강 · 1번 경기/);
    expect(sheetOpen()).toBe(true);
    expect(overlayMarkerOf(window.history.state)).not.toBeNull();

    await back();

    expect(sheetOpen()).toBe(false);
    expect(currentPath()).toBe(BRACKET_PATH);
    expect(appPop).not.toHaveBeenCalled();
    expect(nextRouterPop).not.toHaveBeenCalled();
  });

  it('팀 고르기 화면에서 뒤로가기를 눌러도 시트 전체가 한 번에 닫힌다', async () => {
    openCard(/8강 · 1번 경기/);
    fireEvent.click(screen.getByRole('button', { name: '홈 팀 고르기' }));
    expect(screen.getByRole('list', { name: '넣을 수 있는 팀' })).toBeInTheDocument();

    await back();

    expect(sheetOpen()).toBe(false);
    expect(currentPath()).toBe(BRACKET_PATH);
  });

  it('✕ 로 닫으면 남는 항목이 없어서 다음 뒤로가기는 화면을 떠난다', async () => {
    openCard(/8강 · 1번 경기/);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '닫기' }));
      await settleHistory();
    });
    expect(sheetOpen()).toBe(false);
    expect(overlayMarkerOf(window.history.state)).toBeNull();

    await back();
    expect(currentPath()).toBe('/home');
  });

  it('점수 입력이 끝나 시트가 닫혀도 남는 항목이 없다', async () => {
    openCard(/8강 · 2번 경기/);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '폼 완료' }));
      await settleHistory();
    });
    expect(sheetOpen()).toBe(false);
    expect(overlayMarkerOf(window.history.state)).toBeNull();

    await back();
    expect(currentPath()).toBe('/home');
  });
});
