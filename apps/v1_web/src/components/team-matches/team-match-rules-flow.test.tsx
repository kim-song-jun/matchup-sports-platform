import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readExpiringDraft, writeExpiringDraft } from '@/lib/expiring-draft';
import { __resetNavigationHistoryForTests } from '@/lib/navigation-history';
import { __resetOverlayHistoryForTests } from '@/lib/overlay-history';
import { draftFromTeamMatchEdit, TeamMatchCreatePageClient, TeamMatchEditPageClient } from './team-matches-create-client';
import { installRulesFlowApi, renderRulesFlow, rulesDraft, rulesDraftKey, rulesHostId, rulesMatchId, rulesServerEdit } from './team-match-rules-flow.fixtures';

import { teamMatchEditDraftKey } from './team-match-rules-draft';

const navigation = vi.hoisted(() => ({ push: vi.fn(), pathname: '/team-matches/new/condition' }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: navigation.push, replace: vi.fn(), back: vi.fn() }),
  usePathname: () => navigation.pathname,
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('next/link', () => ({ default: ({ href, prefetch: _prefetch, ...props }: ComponentProps<'a'> & { href: string; prefetch?: boolean }) => <a {...props} href={href} /> }));

beforeEach(() => {
  vi.clearAllMocks(); window.localStorage.clear();
  __resetNavigationHistoryForTests(); __resetOverlayHistoryForTests();
  navigation.pathname = '/team-matches/new/condition';
  window.history.replaceState(null, '', navigation.pathname);
});
afterEach(() => { cleanup(); __resetNavigationHistoryForTests(); __resetOverlayHistoryForTests(); });

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
