import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { v1Get } from '@/lib/api-client';
import { readExpiringDraft, writeExpiringDraft } from '@/lib/expiring-draft';
import { __resetNavigationHistoryForTests } from '@/lib/navigation-history';
import { __resetOverlayHistoryForTests } from '@/lib/overlay-history';
import { v1Keys } from '@/lib/query-keys';
import { server } from '@/test/msw/server';
import type { V1TeamMatchEdit, V1TeamMatchPeriod } from '@/types/api';
import { draftFromTeamMatchEdit, TeamMatchCreatePageClient, TeamMatchEditPageClient } from './team-matches-create-client';
import { clearRulesFlowQueryClients, installPersistedRulesFlowApi, installRulesFlowApi, renderRulesFlow, rulesDraft, rulesDraftKey, rulesHostId, rulesMatchId, rulesServerEdit } from './team-match-rules-flow.fixtures';

import { teamMatchEditDraftKey } from './team-match-rules-draft';

const navigation = vi.hoisted(() => ({ push: vi.fn(), pathname: '/team-matches/new/condition' }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: navigation.push, replace: vi.fn(), back: vi.fn() }),
  usePathname: () => navigation.pathname,
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('next/link', () => ({ default: ({ href, prefetch: _prefetch, ...props }: ComponentProps<'a'> & { href: string; prefetch?: boolean }) => <a {...props} href={href} /> }));

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost/api/v1');
  vi.clearAllMocks(); window.localStorage.clear();
  __resetNavigationHistoryForTests(); __resetOverlayHistoryForTests();
  navigation.pathname = '/team-matches/new/condition';
  window.history.replaceState(null, '', navigation.pathname);
});
afterEach(() => {
  cleanup(); clearRulesFlowQueryClients(); server.resetHandlers(); vi.unstubAllEnvs();
  __resetNavigationHistoryForTests(); __resetOverlayHistoryForTests();
});
afterAll(() => server.close());

const currentSinglePeriod: readonly V1TeamMatchPeriod[] = [
  { code: 'SINGLE_PERIOD', label: '단일', durationMinutes: 37, extraTime: false },
];
const historicHalfDefaults: readonly V1TeamMatchPeriod[] = [
  { code: 'FIRST_HALF', label: '전반', durationMinutes: 20, extraTime: false },
  { code: 'SECOND_HALF', label: '후반', durationMinutes: 20, extraTime: false },
];

async function submitRulesAndReadSavedEdit(
  user: ReturnType<typeof userEvent.setup>, rules: ReturnType<typeof renderRulesFlow>,
): Promise<V1TeamMatchEdit> {
  await user.click(screen.getByRole('button', { name: '다음' }));
  expect(navigation.push).toHaveBeenCalledWith('/team-matches/new/place-time');
  rules.unmount();
  navigation.pathname = '/team-matches/new/confirm';
  renderRulesFlow(<TeamMatchCreatePageClient step="confirm" />, rules.queryClient);
  await waitFor(() => expect(screen.getByRole('button', { name: '팀매치 만들기' })).toBeEnabled());
  await user.dblClick(screen.getByRole('button', { name: '팀매치 만들기' }));
  await waitFor(() => expect(navigation.push).toHaveBeenCalledWith('/team-matches/msw-team-match-1'));
  return v1Get<V1TeamMatchEdit>('/team-matches/msw-team-match-1/edit');
}

describe('MD-QA #141 current single-period default and stored half-history UI boundaries', () => {
  it('selects actual half-history defaults from a current single-period option and persists user-entered halves through one final POST', async () => {
    // Given: the shared stateful HTTP factory exposes current SINGLE_PERIOD 37 and real 20/20 history.
    const api = installPersistedRulesFlowApi({ periods: currentSinglePeriod, twoPeriodDefaults: historicHalfDefaults });
    writeExpiringDraft(rulesDraftKey, rulesDraft());
    navigation.pathname = '/team-matches/new/rules';
    const user = userEvent.setup();
    const rules = renderRulesFlow(<TeamMatchCreatePageClient step="rules" />);
    expect(await screen.findByLabelText('경기 시간')).toHaveValue(37);
    const halves = screen.getByRole('radio', { name: '전후반' });
    expect(halves).toBeEnabled();

    // When: the real rules control selects history and the user changes each half before final save.
    await user.click(halves);
    expect(await screen.findByLabelText('전반 시간')).toHaveValue(20);
    expect(screen.getByLabelText('후반 시간')).toHaveValue(20);
    fireEvent.change(screen.getByLabelText('전반 시간'), { target: { value: '23' } });
    fireEvent.change(screen.getByLabelText('후반 시간'), { target: { value: '29' } });
    expect(api.writes).toEqual([]);
    const saved = await submitRulesAndReadSavedEdit(user, rules);

    // Then: the actual POST and independent edit GET agree; this is MSW consumer persistence evidence.
    expect(api.writes).toHaveLength(1);
    expect(api.writes[0]).toMatchObject({ method: 'POST', payload: { periods: [{ durationMinutes: 23 }, { durationMinutes: 29 }] } });
    expect(saved.form.periods).toEqual([{ durationMinutes: 23 }, { durationMinutes: 29 }]);
    expect(saved.competitionConfigVersionId).toBe('msw-config-sport-futsal-23-29');
  });

  it('disables an unavailable half-history choice with a reason while retaining a valid single-period final POST', async () => {
    // Given: the same current single-period config has no valid active half-history.
    const api = installPersistedRulesFlowApi({ periods: currentSinglePeriod, twoPeriodDefaults: null });
    writeExpiringDraft(rulesDraftKey, rulesDraft());
    navigation.pathname = '/team-matches/new/rules';
    const user = userEvent.setup();
    const rules = renderRulesFlow(<TeamMatchCreatePageClient step="rules" />);
    expect(await screen.findByLabelText('경기 시간')).toHaveValue(37);

    // When: the user inspects or attempts the unavailable composition.
    const halves = screen.getByRole('radio', { name: '전후반' });
    expect(halves).toBeDisabled();
    expect(await screen.findByText(/전후반.*기본.*없/)).toBeInTheDocument();
    await user.click(halves);

    // Then: single remains selected and can really be submitted and read back without invented halves.
    expect(screen.getByRole('radio', { name: '단판' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.queryByLabelText('전반 시간')).not.toBeInTheDocument();
    const saved = await submitRulesAndReadSavedEdit(user, rules);
    expect(api.writes).toHaveLength(1);
    expect(api.writes[0].payload.periods).toEqual([{ durationMinutes: 37 }]);
    expect(saved.form.periods).toEqual([{ durationMinutes: 37 }]);
  });

  it('blocks int4 overflow before advancing but accepts and persists the maximum valid period minutes', async () => {
    // Given: actual single-period controls backed by the shared transport and storage validator.
    const api = installPersistedRulesFlowApi({ periods: currentSinglePeriod, twoPeriodDefaults: historicHalfDefaults });
    writeExpiringDraft(rulesDraftKey, rulesDraft());
    navigation.pathname = '/team-matches/new/rules';
    const user = userEvent.setup();
    const rules = renderRulesFlow(<TeamMatchCreatePageClient step="rules" />);
    const minutes = await screen.findByLabelText('경기 시간');

    // When: one minute beyond the persisted PostgreSQL int4 boundary is entered.
    fireEvent.change(minutes, { target: { value: '2147483648' } });
    await user.click(screen.getByRole('button', { name: '다음' }));

    // Then: neither navigation nor HTTP writes occur; the true upper boundary still saves unchanged.
    expect(navigation.push).not.toHaveBeenCalled();
    expect(api.writes).toEqual([]);
    fireEvent.change(minutes, { target: { value: '2147483647' } });
    const saved = await submitRulesAndReadSavedEdit(user, rules);
    expect(api.writes).toHaveLength(1);
    expect(api.writes[0].payload.periods).toEqual([{ durationMinutes: 2147483647 }]);
    expect(saved.form.periods).toEqual([{ durationMinutes: 2147483647 }]);
  });

  it('does not synthesize an overflowing single period by summing two individually valid maximum halves', async () => {
    // Given: both actual half durations are individually valid int4 values.
    const maxHalves = historicHalfDefaults.map((period) => ({ ...period, durationMinutes: 2147483647 }));
    const api = installPersistedRulesFlowApi({ periods: maxHalves, twoPeriodDefaults: maxHalves });
    writeExpiringDraft(rulesDraftKey, rulesDraft());
    navigation.pathname = '/team-matches/new/rules';
    const user = userEvent.setup();
    renderRulesFlow(<TeamMatchCreatePageClient step="rules" />);
    expect(await screen.findByLabelText('전반 시간')).toHaveValue(2147483647);

    // When: the single-period conversion would produce 4294967294, which cannot be persisted.
    const single = screen.getByRole('radio', { name: '단판' });
    expect(single).toBeDisabled();
    expect(await screen.findByText(/단판.*(?:초과|범위)|합계.*(?:초과|범위)/)).toBeInTheDocument();
    await user.click(single);

    // Then: the valid half inputs remain untouched and no invalid implicit write occurs.
    expect(screen.getByRole('radio', { name: '전후반' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByLabelText('전반 시간')).toHaveValue(2147483647);
    expect(screen.getByLabelText('후반 시간')).toHaveValue(2147483647);
    expect(screen.queryByLabelText('경기 시간')).not.toBeInTheDocument();
    expect(navigation.push).not.toHaveBeenCalled();
    expect(api.writes).toEqual([]);
  });
});

describe('MD-QA #141 actual separate rules flow entry', () => {
  it('condition next opens the separate rules route and retains entered content without a write', async () => {
    const api = installRulesFlowApi();
    writeExpiringDraft(rulesDraftKey, rulesDraft());
    const user = userEvent.setup(); renderRulesFlow(<TeamMatchCreatePageClient step="condition" />);
    await waitFor(() => expect(screen.getByLabelText('최소 등급')).toHaveValue('novice'));
    await user.click(screen.getByRole('button', { name: '다음' }));
    expect(navigation.push).toHaveBeenCalledWith('/team-matches/new/rules');
    expect(readExpiringDraft(rulesDraftKey)).toMatchObject({ title: '합성 규칙 경기', description: '이전 단계에서 작성한 설명', grade: '초보-중수' });
    expect(api.writes).toEqual([]);
  });

  it('current entity edit exposes the separate rules entry without saving intermediate changes', async () => {
    const api = installRulesFlowApi();
    navigation.pathname = '/team-matches/' + rulesMatchId + '/edit';
    const user = userEvent.setup(); renderRulesFlow(<TeamMatchEditPageClient teamMatchId={rulesMatchId} />);
    await waitFor(() => expect(screen.getByLabelText('매치 제목')).toHaveValue('서버에 저장된 현재 경기'));
    await user.type(screen.getByLabelText('설명'), ' 함께 보존');
    await user.click(screen.getByRole('button', { name: '경기 규칙 설정' }));
    expect(navigation.push).toHaveBeenCalledWith('/team-matches/' + rulesMatchId + '/edit/rules');
    expect(api.writes).toEqual([]);
  });

  it('invalid condition range still blocks forward navigation and preserves the draft', async () => {
    const api = installRulesFlowApi();
    writeExpiringDraft(rulesDraftKey, rulesDraft('고수-입문'));
    const user = userEvent.setup(); renderRulesFlow(<TeamMatchCreatePageClient step="condition" />);
    await user.click(screen.getByRole('button', { name: '다음' }));
    await waitFor(() => expect(screen.getByLabelText('최소 등급')).toHaveAttribute('aria-invalid', 'true'));
    expect(navigation.push).not.toHaveBeenCalled();
    expect(readExpiringDraft(rulesDraftKey)).toMatchObject({ grade: '고수-입문' });
    expect(api.writes).toEqual([]);
  });
});


describe('MD-QA #141 actual rules selection, save, and persisted reopen', () => {
  it('uses API minutes, preserves the creation draft across rules, and sends only one final POST', async () => {
    const api = installRulesFlowApi(); writeExpiringDraft(rulesDraftKey, rulesDraft());
    navigation.pathname = '/team-matches/new/rules';
    const user = userEvent.setup(); const rules = renderRulesFlow(<TeamMatchCreatePageClient step="rules" />);
    expect(await screen.findByLabelText('전반 시간')).toHaveValue(17);
    expect(screen.getByLabelText('후반 시간')).toHaveValue(19);
    await user.click(screen.getByRole('radio', { name: '단판' }));
    expect(screen.getByLabelText('경기 시간')).toHaveValue(36);
    fireEvent.change(screen.getByLabelText('경기 시간'), { target: { value: '41' } });
    await user.click(screen.getByRole('button', { name: '다음' }));
    expect(navigation.push).toHaveBeenCalledWith('/team-matches/new/place-time');
    expect(api.writes).toEqual([]);
    rules.unmount(); navigation.pathname = '/team-matches/new/confirm';
    renderRulesFlow(<TeamMatchCreatePageClient step="confirm" />);
    expect(await screen.findByText('단판 · 41분')).toBeInTheDocument();
    expect(screen.getByText('이전 단계에서 작성한 설명')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: '팀매치 만들기' })).toBeEnabled());
    await user.dblClick(screen.getByRole('button', { name: '팀매치 만들기' }));
    await waitFor(() => expect(api.writes).toHaveLength(1));
    expect(api.writes[0]).toMatchObject({ method: 'POST', payload: {
      hostTeamId: rulesHostId, title: '합성 규칙 경기', description: '이전 단계에서 작성한 설명',
      periods: [{ durationMinutes: 41 }], manualPlaceName: '합성 경기장',
    } });
    expect(api.writes[0].payload).not.toHaveProperty('rules');
    expect(api.writes[0].payload).not.toHaveProperty('competitionConfigVersionId');
    expect(navigation.push).toHaveBeenCalledWith('/team-matches/mdqa141-created');
  });

  it('edit preserves general fields through its rules route, PATCHes once, and reopens server-saved periods', async () => {
    const api = installRulesFlowApi(); navigation.pathname = '/team-matches/' + rulesMatchId + '/edit';
    const user = userEvent.setup(); const general = renderRulesFlow(<TeamMatchEditPageClient teamMatchId={rulesMatchId} />);
    await waitFor(() => expect(screen.getByLabelText('매치 제목')).toHaveValue('서버에 저장된 현재 경기'));
    await user.type(screen.getByLabelText('설명'), ' 추가 내용');
    await user.click(screen.getByRole('button', { name: '경기 규칙 설정' }));
    expect(api.writes).toEqual([]); general.unmount();
    navigation.pathname = '/team-matches/' + rulesMatchId + '/edit/rules';
    const rules = renderRulesFlow(<TeamMatchEditPageClient teamMatchId={rulesMatchId} rulesStep />);
    expect(await screen.findByLabelText('전반 시간')).toHaveValue(17);
    await user.click(screen.getByRole('radio', { name: '단판' }));
    fireEvent.change(screen.getByLabelText('경기 시간'), { target: { value: '35' } });
    await user.click(screen.getByRole('button', { name: '설정 적용' }));
    expect(api.writes).toEqual([]); rules.unmount();
    navigation.pathname = '/team-matches/' + rulesMatchId + '/edit';
    const save = renderRulesFlow(<TeamMatchEditPageClient teamMatchId={rulesMatchId} />);
    await waitFor(() => expect(screen.getByLabelText('설명')).toHaveValue('현재 경기 설명 추가 내용'));
    expect(screen.getByText('단판 · 35분')).toBeInTheDocument();
    await user.dblClick(screen.getByRole('button', { name: '변경사항 저장' }));
    await waitFor(() => expect(api.writes).toHaveLength(1));
    expect(api.writes[0]).toMatchObject({ method: 'PATCH', teamMatchId: rulesMatchId, payload: {
      title: '서버에 저장된 현재 경기', description: '현재 경기 설명 추가 내용', version: '2030-10-01T00:00:00.000Z',
      periods: [{ durationMinutes: 35 }], manualPlaceName: '합성 경기장',
    } });
    expect(api.writes[0].payload).not.toHaveProperty('competitionConfigVersionId');
    await waitFor(() => expect(navigation.push).toHaveBeenCalledWith('/team-matches/' + rulesMatchId));
    save.unmount(); renderRulesFlow(<TeamMatchEditPageClient teamMatchId={rulesMatchId} rulesStep />);
    expect(await screen.findByLabelText('경기 시간')).toHaveValue(35);
    expect(screen.getByRole('radio', { name: '단판' })).toHaveAttribute('aria-checked', 'true');
  });

  it.each(['0', '-1', '1.5'])('rejects nonpositive or fractional duration %s through the actual rules screen', async (value) => {
    const api = installRulesFlowApi(); writeExpiringDraft(rulesDraftKey, rulesDraft());
    navigation.pathname = '/team-matches/new/rules';
    const user = userEvent.setup(); renderRulesFlow(<TeamMatchCreatePageClient step="rules" />);
    await screen.findByLabelText('전반 시간');
    fireEvent.change(screen.getByLabelText('전반 시간'), { target: { value } });
    await user.click(screen.getByRole('button', { name: '다음' }));
    expect(navigation.push).not.toHaveBeenCalled(); expect(api.writes).toEqual([]);
    expect(screen.getByRole('radio', { name: '전후반' })).toHaveAttribute('aria-checked', 'true');
    expect(await screen.findByText(/경기 규칙을 확인해 주세요/)).toBeInTheDocument();
  });

  it.each(['different-entity', 'older-version', 'different-pin', 'nested-wrong-pin'])('rejects %s stored edit draft against the actual route GET', async (kind) => {
    const edit = rulesServerEdit(); const api = installRulesFlowApi();
    const stored = { teamMatchId: edit.teamMatchId, version: edit.version, competitionConfigVersionId: edit.competitionConfigVersionId,
      regionId: edit.form.regionId, draft: { ...draftFromTeamMatchEdit(edit), title: '누출되면 안 되는 초안' }, rulesChanged: true, touched: true };
    if (kind === 'different-entity') stored.teamMatchId = 'another-match';
    if (kind === 'older-version') stored.version = 'old-version';
    if (kind === 'different-pin') stored.competitionConfigVersionId = 'old-pin';
    if (kind === 'nested-wrong-pin' && stored.draft.rules) stored.draft.rules.competitionConfigVersionId = 'wrong-nested-pin';
    writeExpiringDraft(teamMatchEditDraftKey(rulesMatchId), stored);
    navigation.pathname = '/team-matches/' + rulesMatchId + '/edit';
    renderRulesFlow(<TeamMatchEditPageClient teamMatchId={rulesMatchId} />);
    await waitFor(() => expect(screen.getByLabelText('매치 제목')).toHaveValue('서버에 저장된 현재 경기'));
    expect(screen.getByText('전후반 · 전반 17분 · 후반 19분')).toBeInTheDocument();
    expect(api.writes).toEqual([]);
  });

  it('historical missing rules stay explicitly unavailable while general edit saves with periods omitted', async () => {
    const edit = rulesServerEdit(); edit.rulesEditable = false; edit.rulesLockedReason = 'COMPETITION_CONFIG_REQUIRED';
    edit.competitionConfigVersionId = null; edit.form.periods = null;
    const api = installRulesFlowApi({ edit }); navigation.pathname = '/team-matches/' + rulesMatchId + '/edit/rules';
    const user = userEvent.setup(); const rules = renderRulesFlow(<TeamMatchEditPageClient teamMatchId={rulesMatchId} rulesStep />);
    expect(await screen.findByText(/이 경기의 저장된 규칙을 찾을 수 없어 경기 시간을 바꿀 수 없어요/)).toBeInTheDocument();
    expect(screen.queryByLabelText('경기 시간')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('전반 시간')).not.toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: '수정 화면으로' })[0]); rules.unmount();
    navigation.pathname = '/team-matches/' + rulesMatchId + '/edit';
    renderRulesFlow(<TeamMatchEditPageClient teamMatchId={rulesMatchId} />);
    await waitFor(() => expect(screen.getByLabelText('매치 제목')).toHaveValue(edit.form.title));
    await user.type(screen.getByLabelText('설명'), ' 일반 내용 변경');
    await user.click(screen.getByRole('button', { name: '변경사항 저장' }));
    await waitFor(() => expect(api.writes).toHaveLength(1));
    expect(api.writes[0].payload).not.toHaveProperty('periods');
  });

  it('locked rules disable duration controls and cannot produce an intermediate PATCH', async () => {
    const edit = rulesServerEdit(); edit.rulesEditable = false; edit.rulesLockedReason = 'TEAM_MATCH_RULES_LOCKED';
    const api = installRulesFlowApi({ edit }); navigation.pathname = '/team-matches/' + rulesMatchId + '/edit/rules';
    renderRulesFlow(<TeamMatchEditPageClient teamMatchId={rulesMatchId} rulesStep />);
    expect(await screen.findByLabelText('전반 시간')).toBeDisabled();
    expect(screen.getByRole('radio', { name: '단판' })).toBeDisabled();
    expect(api.writes).toEqual([]);
  });

  it('option permission failure exposes retry and preserves the draft without a false default choice', async () => {
    const api = installRulesFlowApi({ fault: { status: 403, code: 'FORBIDDEN', message: '현재 팀의 관리 권한이 없어요.' } });
    writeExpiringDraft(rulesDraftKey, rulesDraft()); navigation.pathname = '/team-matches/new/rules';
    const user = userEvent.setup(); renderRulesFlow(<TeamMatchCreatePageClient step="rules" />);
    expect(await screen.findByText('현재 팀의 관리 권한이 없어요.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '다음' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: '기존 기본 규칙 사용' })).not.toBeInTheDocument();
    expect(readExpiringDraft(rulesDraftKey)).toMatchObject({ description: '이전 단계에서 작성한 설명' });
    api.setFault(null); await user.click(screen.getByRole('button', { name: '다시 시도하기' }));
    expect(await screen.findByLabelText('전반 시간')).toHaveValue(17); expect(api.writes).toEqual([]);
  });

  it('valid nonstandard server default requires an explicit choice and final POST omits customization', async () => {
    const api = installRulesFlowApi({ fault: { status: 409, code: 'COMPETITION_PERIODS_UNAVAILABLE', message: '기간별 시간 설정을 지원하지 않는 규칙이에요.' } });
    writeExpiringDraft(rulesDraftKey, rulesDraft()); navigation.pathname = '/team-matches/new/rules';
    const user = userEvent.setup(); const rules = renderRulesFlow(<TeamMatchCreatePageClient step="rules" />);
    await screen.findByText('기간별 시간 설정을 지원하지 않는 규칙이에요.');
    expect(screen.getByRole('button', { name: '다음' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: '기존 기본 규칙 사용' }));
    await user.click(screen.getByRole('button', { name: '다음' }));
    expect(navigation.push).toHaveBeenCalledWith('/team-matches/new/place-time'); rules.unmount();
    navigation.pathname = '/team-matches/new/confirm'; renderRulesFlow(<TeamMatchCreatePageClient step="confirm" />);
    await waitFor(() => expect(screen.getByRole('button', { name: '팀매치 만들기' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: '팀매치 만들기' }));
    await waitFor(() => expect(api.writes).toHaveLength(1));
    expect(api.writes[0].payload).not.toHaveProperty('periods');
  });
});


describe('MD-QA #141 actual current-entity and background failure recovery', () => {
  it('restores general fields and applied rules when leaving edit with the saved-draft promise and reopening the same version', async () => {
    // Given: actual edit data and a changed general field carried through the separate rules route.
    const api = installRulesFlowApi();
    navigation.pathname = '/team-matches/' + rulesMatchId + '/edit';
    window.history.replaceState(null, '', navigation.pathname);
    const user = userEvent.setup();
    const general = renderRulesFlow(<TeamMatchEditPageClient teamMatchId={rulesMatchId} />);
    await waitFor(() => expect(screen.getByLabelText('매치 제목')).toHaveValue('서버에 저장된 현재 경기'));
    await user.type(screen.getByLabelText('설명'), ' 나갔다 돌아와도 유지');
    await user.click(screen.getByRole('button', { name: '경기 규칙 설정' }));
    general.unmount();
    navigation.pathname = '/team-matches/' + rulesMatchId + '/edit/rules';
    const rules = renderRulesFlow(<TeamMatchEditPageClient teamMatchId={rulesMatchId} rulesStep />, general.queryClient);
    await screen.findByLabelText('전반 시간');
    await user.click(screen.getByRole('radio', { name: '단판' }));
    fireEvent.change(screen.getByLabelText('경기 시간'), { target: { value: '37' } });
    await user.click(screen.getByRole('button', { name: '설정 적용' }));
    rules.unmount();
    navigation.pathname = '/team-matches/' + rulesMatchId + '/edit';
    const edited = renderRulesFlow(<TeamMatchEditPageClient teamMatchId={rulesMatchId} />, general.queryClient);
    await waitFor(() => expect(screen.getByLabelText('설명')).toHaveValue('현재 경기 설명 나갔다 돌아와도 유지'));
    expect(screen.getByText('단판 · 37분')).toBeInTheDocument();

    // When: the user accepts the explicit promise that this device keeps the draft.
    await user.click(screen.getByRole('button', { name: '변경 취소' }));
    const dialog = await screen.findByRole('dialog', { name: '작성을 멈추고 나갈까요?' });
    expect(within(dialog).getByText('작성 중인 내용은 이 기기에 잠시 저장돼 다음에 이어서 쓸 수 있어요.')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: '나가기' }));
    await waitFor(() => expect(navigation.push).toHaveBeenCalledWith('/team-matches/' + rulesMatchId));
    edited.unmount();
    renderRulesFlow(<TeamMatchEditPageClient teamMatchId={rulesMatchId} />, general.queryClient);

    // Then: the same API entity/version restores both user changes without a PATCH.
    await waitFor(() => expect(screen.getByLabelText('설명')).toHaveValue('현재 경기 설명 나갔다 돌아와도 유지'));
    expect(screen.getByText('단판 · 37분')).toBeInTheDocument();
    expect(api.writes).toEqual([]);
  });

  it('keeps an explicit default choice after cached options refetch fails and omits periods from the final POST', async () => {
    // Given: one successful options response is already cached in this actual QueryClient.
    const api = installRulesFlowApi();
    writeExpiringDraft(rulesDraftKey, rulesDraft());
    navigation.pathname = '/team-matches/new/rules';
    const user = userEvent.setup();
    const rules = renderRulesFlow(<TeamMatchCreatePageClient step="rules" />);
    expect(await screen.findByLabelText('전반 시간')).toHaveValue(17);
    api.setFault({ status: 409, code: 'COMPETITION_PERIODS_UNAVAILABLE', message: '기간별 시간 설정을 지원하지 않는 규칙이에요.' });
    await act(async () => {
      await rules.queryClient.refetchQueries({ queryKey: [...v1Keys.team(rulesHostId), 'team-match-rule-options'], exact: true });
    });
    await screen.findByText('기간별 시간 설정을 지원하지 않는 규칙이에요.');
    expect(screen.getByRole('button', { name: '다음' })).toBeDisabled();

    // When: the user explicitly chooses the valid default-only recovery path.
    await user.click(screen.getByRole('button', { name: '기존 기본 규칙 사용' }));

    // Then: retained stale data cannot overwrite the choice or leak custom periods into POST.
    await waitFor(() => expect(screen.getByRole('button', { name: '기존 기본 규칙 사용' })).toHaveAttribute('aria-pressed', 'true'));
    expect(screen.getByRole('button', { name: '다음' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: '다음' }));
    expect(navigation.push).toHaveBeenCalledWith('/team-matches/new/place-time');
    rules.unmount();
    navigation.pathname = '/team-matches/new/confirm';
    renderRulesFlow(<TeamMatchCreatePageClient step="confirm" />, rules.queryClient);
    await waitFor(() => expect(screen.getByRole('button', { name: '팀매치 만들기' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: '팀매치 만들기' }));
    await waitFor(() => expect(api.writes).toHaveLength(1));
    expect(api.writes[0]).toMatchObject({ method: 'POST', payload: { title: '합성 규칙 경기' } });
    expect(api.writes[0].payload).not.toHaveProperty('periods');
  });

  it('edit permission failure renders actual error, current-entity back, and successful retry', async () => {
    const api = installRulesFlowApi({ editFault: { status: 403, code: 'FORBIDDEN', message: '이 경기를 수정할 권한이 없어요.' } });
    navigation.pathname = '/team-matches/' + rulesMatchId + '/edit/rules';
    const user = userEvent.setup(); renderRulesFlow(<TeamMatchEditPageClient teamMatchId={rulesMatchId} rulesStep />);
    expect(await screen.findByText('이 경기를 수정할 권한이 없어요.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '경기 상세로' })).toHaveAttribute('href', '/team-matches/' + rulesMatchId);
    expect(screen.queryByLabelText('전반 시간')).not.toBeInTheDocument();
    expect(api.writes).toEqual([]); api.setEditFault(null);
    await user.click(screen.getByRole('button', { name: '다시 시도하기' }));
    expect(await screen.findByLabelText('전반 시간')).toHaveValue(17);
  });
  it('confirm requery failure retains entered summary, blocks POST, and recovers on explicit retry', async () => {
    const api = installRulesFlowApi({ fault: { status: 403, code: 'FORBIDDEN', message: '경기 규칙 재조회가 실패했어요.' } });
    writeExpiringDraft(rulesDraftKey, { ...rulesDraft(), rules: { hostTeamId: rulesHostId, sportId: 'sport-futsal',
      competitionConfigVersionId: 'config-original', mode: 'custom', confirmed: true, periods: [{ durationMinutes: 41 }] } });
    navigation.pathname = '/team-matches/new/confirm';
    const user = userEvent.setup(); renderRulesFlow(<TeamMatchCreatePageClient step="confirm" />);
    expect(await screen.findByText('경기 규칙 재조회가 실패했어요.')).toBeInTheDocument();
    expect(screen.getByText('단판 · 41분')).toBeInTheDocument();
    expect(screen.getByText('이전 단계에서 작성한 설명')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '팀매치 만들기' })).toBeDisabled();
    expect(api.writes).toEqual([]); api.setFault(null);
    await user.click(screen.getByRole('button', { name: '다시 시도하기' }));
    await waitFor(() => expect(screen.getByRole('button', { name: '팀매치 만들기' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: '팀매치 만들기' }));
    await waitFor(() => expect(api.writes).toHaveLength(1));
    expect(api.writes[0].payload.periods).toEqual([{ durationMinutes: 41 }]);
  });
});
