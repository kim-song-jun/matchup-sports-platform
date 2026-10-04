import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ComponentProps, ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readExpiringDraft, writeExpiringDraft } from '@/lib/expiring-draft';
import { __resetNavigationHistoryForTests } from '@/lib/navigation-history';
import { __resetOverlayHistoryForTests } from '@/lib/overlay-history';
import type { V1TeamMatchEdit, V1TeamMatchMutationPayload } from '@/types/api';
import { TeamMatchCreatePageClient, TeamMatchEditPageClient } from './team-matches-create-client';
import { getTeamMatchCreateViewModel } from './team-matches.view-model';

const state = vi.hoisted(() => ({
  push: vi.fn(), create: vi.fn(), update: vi.fn(),
  edit: null as V1TeamMatchEdit | null,
  pathname: '/team-matches/new/condition',
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: state.push, replace: vi.fn(), back: vi.fn() }),
  usePathname: () => state.pathname,
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('next/link', () => ({ default: ({ href, prefetch: _prefetch, ...props }: ComponentProps<'a'> & { href: string; prefetch?: boolean }) => (
  <a {...props} href={href} />
) }));
vi.mock('@/hooks/use-v1-api', () => ({
  useV1MyTeams: () => ({ data: [{
    teamId: 'conditions-host', name: '합성 조건 팀', role: 'owner', status: 'active',
    sport: { sportId: 'sport-futsal', name: '풋살' }, memberCount: 8,
    canManage: true, canCreateTeamMatch: true,
  }], isLoading: false, isError: false }),
  useV1MasterSports: () => ({ data: [{ id: 'sport-futsal', code: 'futsal', name: '풋살', levels: [] }] }),
  useV1MasterRegions: () => ({ data: [
    { id: 'region-seoul', name: '서울', parentId: null, level: 1 },
    { id: 'region-gangnam', name: '강남구', parentId: 'region-seoul', level: 2 },
  ] }),
  useV1CreateTeamMatch: () => ({ mutate: state.create, isPending: false }),
  useV1TeamMatchEdit: () => ({ data: state.edit, isLoading: false, isError: false }),
  useV1UpdateTeamMatch: () => ({ mutate: state.update, isPending: false }),
  useV1CancelTeamMatch: () => ({ mutate: vi.fn(), isPending: false }),
  useV1UploadImages: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useV1TeamRecentVenues: () => ({ data: { items: [] } }),
}));

// 실제 client와 조건 폼을 실행한다. API 훅만 경계에서 대체하며 CSS/alpha 검증은 아니다.
function renderClient(ui: ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}
const draftKey = 'teameet:v1:team-match-draft:v3';
function storedDraft(grade = '', gender = '성별 무관') {
  return { ...getTeamMatchCreateViewModel('condition').draft,
    title: '합성 범위·혼성 팀매치', grade, gender,
    venue: '합성 풋살장', date: '2030-10-10', startTime: '18:00',
  };
}
function editFixture(minLevelCode: string | null, maxLevelCode: string | null, genderRule = '성별 무관'): V1TeamMatchEdit {
  return {
    teamMatchId: 'conditions-match', editable: true, lockedReason: null, status: 'recruiting', version: 'v1',
    form: {
      hostTeamId: 'conditions-host', sportId: 'sport-futsal', regionId: 'region-gangnam',
      title: '합성 수정 팀매치', description: '저장된 설명', startsAt: '2030-10-10T09:00:00.000Z',
      endsAt: null, deadlineAt: null, manualPlaceName: '합성 풋살장',
      minLevelCode, maxLevelCode, genderRule, matchFormat: '5:5', matchStyle: [], uniformColor: null,
    },
  };
}
beforeEach(() => {
  __resetOverlayHistoryForTests(); __resetNavigationHistoryForTests();
  window.history.replaceState(null, '', '/team-matches/new/condition');
  vi.clearAllMocks(); window.localStorage.clear(); state.edit = null;
  state.pathname = '/team-matches/new/condition';
  state.create.mockImplementation((_payload, { onSuccess }) => onSuccess({ teamMatchId: 'created-conditions', detailRoute: '/team-matches/created-conditions' }));
  state.update.mockImplementation((_payload, { onSuccess }) => onSuccess({ teamMatchId: 'conditions-match' }));
});
afterEach(() => {
  cleanup(); __resetOverlayHistoryForTests(); __resetNavigationHistoryForTests();
});

describe('#1599 actual team-match create/edit conditions', () => {
  it('creation range and unchanged gender condition survive step remount and reach the real payload builder', async () => {
    writeExpiringDraft(draftKey, storedDraft());
    const user = userEvent.setup(); const first = renderClient(<TeamMatchCreatePageClient step="condition" />);
    await user.selectOptions(screen.getByLabelText('최소 등급'), 'beginner');
    await user.selectOptions(screen.getByLabelText('최대 등급'), 'intermediate');
    await user.click(screen.getByRole('button', { name: '혼성' }));
    await user.click(screen.getByRole('button', { name: '다음' }));
    expect(state.push).toHaveBeenCalledWith('/team-matches/new/place-time');
    first.unmount(); state.pathname = '/team-matches/new/confirm';
    renderClient(<TeamMatchCreatePageClient step="confirm" />);
    expect(screen.getAllByText(/입문-중수/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/혼성/).length).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: '팀매치 만들기' }));
    await waitFor(() => expect(state.create).toHaveBeenCalledWith(expect.objectContaining({
      minLevelCode: 'beginner', maxLevelCode: 'intermediate', genderRule: '성별 무관',
    }), expect.any(Object)));
    expect(state.push).toHaveBeenCalledWith('/team-matches/created-conditions');
    expect(readExpiringDraft(draftKey)).toBeNull();
  });

  it.each([
    [null, null, '', ''],
    ['novice', 'novice', 'novice', 'novice'],
    ['beginner', 'advanced', 'beginner', 'advanced'],
    ['novice', 'intermediate', 'novice', 'intermediate'],
  ])('edit preserves %s–%s after an unrelated description change', async (min, max, shownMin, shownMax) => {
    state.edit = editFixture(min, max); state.pathname = '/team-matches/conditions-match/edit';
    const user = userEvent.setup(); renderClient(<TeamMatchEditPageClient teamMatchId="conditions-match" />);
    await waitFor(() => expect(screen.getByLabelText('최소 등급')).toHaveValue(shownMin));
    expect(screen.getByLabelText('최대 등급')).toHaveValue(shownMax);
    expect(screen.getByRole('button', { name: '혼성' })).toHaveAttribute('aria-pressed', 'true');
    await user.type(screen.getByLabelText('설명'), ' 변경');
    await user.click(screen.getByRole('button', { name: '변경사항 저장' }));
    await waitFor(() => expect(state.update).toHaveBeenCalledWith(expect.objectContaining({
      minLevelCode: min, maxLevelCode: max, genderRule: '성별 무관', description: '저장된 설명 변경',
    }), expect.any(Object)));
  });

  it('consecutive changes keep ordered endpoints atomically and persist the latest range', async () => {
    writeExpiringDraft(draftKey, storedDraft('초보-중수'));
    const user = userEvent.setup(); renderClient(<TeamMatchCreatePageClient step="condition" />);
    await user.selectOptions(screen.getByLabelText('최소 등급'), 'advanced');
    expect(screen.getByLabelText('최대 등급')).toHaveValue('advanced');
    await user.selectOptions(screen.getByLabelText('최대 등급'), 'beginner');
    expect(screen.getByLabelText('최소 등급')).toHaveValue('beginner');
    await user.selectOptions(screen.getByLabelText('최대 등급'), 'advanced');
    expect(readExpiringDraft<{ grade: string }>(draftKey)?.grade).toBe('입문-고수');
  });

  it('failed edit retries preserve the chosen endpoints and unchanged gender condition', async () => {
    state.edit = editFixture('beginner', 'advanced');
    state.update.mockImplementationOnce((_payload, { onError }) => onError(new Error('조건 저장 실패')));
    const user = userEvent.setup(); renderClient(<TeamMatchEditPageClient teamMatchId="conditions-match" />);
    await user.selectOptions(screen.getByLabelText('최소 등급'), 'novice');
    await user.selectOptions(screen.getByLabelText('최대 등급'), 'intermediate');
    await user.click(screen.getByRole('button', { name: '변경사항 저장' }));
    expect(await screen.findByText('조건 저장 실패')).toBeInTheDocument();
    expect(state.push).not.toHaveBeenCalled();
    expect(screen.getByLabelText('최소 등급')).toHaveValue('novice');
    expect(screen.getByLabelText('최대 등급')).toHaveValue('intermediate');
    await user.click(screen.getByRole('button', { name: '변경사항 저장' }));
    expect(state.update).toHaveBeenCalledTimes(2);
    expect((state.update.mock.calls[1][0] as V1TeamMatchMutationPayload)).toMatchObject({
      minLevelCode: 'novice', maxLevelCode: 'intermediate', genderRule: '성별 무관',
    });
  });

  it('previous single-grade drafts remain selectable and unset can be chosen explicitly', async () => {
    writeExpiringDraft(draftKey, storedDraft('중수'));
    const user = userEvent.setup(); renderClient(<TeamMatchCreatePageClient step="condition" />);
    expect(screen.getByLabelText('최소 등급')).toHaveValue('intermediate');
    expect(screen.getByLabelText('최대 등급')).toHaveValue('intermediate');
    await user.selectOptions(screen.getByLabelText('최소 등급'), '');
    expect(screen.getByLabelText('최대 등급')).toHaveValue('');
    expect(readExpiringDraft<{ grade: string }>(draftKey)?.grade).toBe('');
  });

  it('invalid restored grade blocks advance, focuses its control and can be corrected', async () => {
    writeExpiringDraft(draftKey, storedDraft('고수-입문'));
    const user = userEvent.setup(); renderClient(<TeamMatchCreatePageClient step="condition" />);
    await user.click(screen.getByRole('button', { name: '다음' }));
    expect(state.push).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByLabelText('최소 등급')).toHaveFocus());
    expect(screen.getByLabelText('최소 등급')).toHaveAttribute('aria-invalid', 'true');
    await user.selectOptions(screen.getByLabelText('최소 등급'), 'novice');
    await user.selectOptions(screen.getByLabelText('최대 등급'), 'advanced');
    await user.click(screen.getByRole('button', { name: '다음' }));
    expect(state.push).toHaveBeenCalledWith('/team-matches/new/place-time');
    expect(readExpiringDraft<{ grade: string }>(draftKey)?.grade).toBe('초보-고수');
  });

  it('cancel and Escape retain an edited range until leaving is explicitly confirmed', async () => {
    state.edit = editFixture('beginner', 'advanced');
    state.pathname = '/team-matches/conditions-match/edit';
    window.history.replaceState(null, '', state.pathname);
    const user = userEvent.setup(); renderClient(<TeamMatchEditPageClient teamMatchId="conditions-match" />);
    await user.selectOptions(screen.getByLabelText('최소 등급'), 'novice');
    await user.click(screen.getByRole('button', { name: '변경 취소' }));
    expect(await screen.findByRole('dialog')).toHaveTextContent('작성 중인 내용이 사라져요');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(state.push).not.toHaveBeenCalled(); expect(state.update).not.toHaveBeenCalled();
    expect(screen.getByLabelText('최소 등급')).toHaveValue('novice');
    expect(screen.getByLabelText('최대 등급')).toHaveValue('advanced');
    await user.click(screen.getByRole('button', { name: '변경 취소' }));
    await user.click(await screen.findByRole('button', { name: '계속 작성' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(state.push).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: '변경 취소' }));
    await user.click(await screen.findByRole('button', { name: '나가기' }));
    await waitFor(() => expect(state.push).toHaveBeenCalledWith('/team-matches/conditions-match'));
    expect(state.update).not.toHaveBeenCalled();
  });
});
