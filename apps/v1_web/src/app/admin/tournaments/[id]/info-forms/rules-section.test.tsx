import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createTournamentInfoFixture, createTournamentInfoServer } from '@/test/msw/tournament-info-handlers';
import { renderInfoSheet, setupTournamentInfoBackend } from '@/test/tournament-info-sheet';
import type { V1Tournament } from '@/types/api';
import { InfoSummaryCard } from '../info-summary-card';
import type { InfoSummaryContext } from './types';
import { rulesSection } from './rules-section';

// 「직접 정하기」 시트가 앱 라우터를 쓴다.
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }) }));

const start = setupTournamentInfoBackend();

const GOALS_FIRST: V1Tournament['tieBreakOrder'] = ['points', 'goal_difference', 'goals_for', 'head_to_head', 'fair_play', 'fewest_goals_against', 'seeded_draw'];
const DEFAULT_ORDER: V1Tournament['tieBreakOrder'] = ['points', 'head_to_head', 'goal_difference', 'goals_for', 'fair_play', 'fewest_goals_against', 'seeded_draw'];
const sixTeam = { format: 'knockout', teamCount: 6, sixTeamMode: true } satisfies Partial<V1Tournament>;

/** 선택지와 경기 시간이 도착한 시트. */
async function open(backend: ReturnType<typeof start>) {
  const view = renderInfoSheet(rulesSection, backend);
  await view.inSheet().findByLabelText('전반');
  await view.inSheet().findByRole('group', { name: '교체' });
  return view;
}
const type = (view: Awaited<ReturnType<typeof open>>, label: string, value: string) =>
  fireEvent.change(view.inSheet().getByLabelText(label), { target: { value } });

describe('경기 규칙 섹션 시트 — 저장 순서(경기 시간 → 경기 규칙)', () => {
  it('경기 시간은 저장되고 경기 규칙이 실패하면 어디까지 됐는지 알리고, 다시 저장하면 남은 호출만 보낸다', async () => {
    const backend = start();
    const view = await open(backend);
    backend.state.failNext('tournament', 400, { message: '팀 파울 기준을 저장할 수 없어요.' });

    type(view, '전반', '25');
    type(view, '팀 파울 기준', '6');
    view.save();

    expect(await view.inSheet().findByRole('alert')).toHaveTextContent(
      '경기 시간은 저장됐고, 경기 규칙 저장에 실패했어요. 팀 파울 기준을 저장할 수 없어요.',
    );
    expect(backend.state.periodPatches).toHaveLength(1);
    expect(backend.state.patches).toHaveLength(1);
    expect(view.inSheet().getByLabelText('팀 파울 기준')).toHaveValue('6');
    expect(view.onClose).not.toHaveBeenCalled();

    view.save();
    await view.saved();

    expect(backend.state.periodPatches).toHaveLength(1);
    expect(backend.state.patches).toHaveLength(2);
    expect(backend.state.tournament.teamFoulThreshold).toBe(6);
    expect(view.onSaved).toHaveBeenCalledWith('경기 규칙 설정을 저장했어요.');
  });

  it('각 호출은 직전 호출이 올린 최신 버전으로 간다', async () => {
    const backend = start();
    const view = await open(backend);

    type(view, '전반', '25');
    type(view, '팀 파울 기준', '6');
    view.save();
    await view.saved();

    expect(backend.state.periodPatches[0].expectedVersion).toBe('2026-11-01T00:00:00.000Z');
    expect(backend.state.patches[0].expectedVersion).toBe('2026-11-01T00:00:01.000Z');
    expect(Object.keys(backend.state.patches[0]).sort()).toEqual(['expectedVersion', 'teamFoulThreshold']);
  });

  it('경기 시간이 실패하면 경기 규칙은 보내지 않는다', async () => {
    const backend = start();
    const view = await open(backend);
    backend.state.failNext('periods', 409, { code: 'TOURNAMENT_VERSION_CONFLICT' });

    type(view, '전반', '25');
    type(view, '팀 파울 기준', '6');
    view.save();

    expect(await view.inSheet().findByRole('alert')).toHaveTextContent('다른 곳에서 먼저 저장돼서 이번 저장은 반영되지 않았어요.');
    expect(backend.state.patches).toEqual([]);
  });

  it('저장된 경기 시간을 실패 뒤에 되돌려 적으면, 되돌린 값도 다시 보낸다', async () => {
    const backend = start();
    const view = await open(backend);
    backend.state.failNext('tournament', 400, { message: '거절' });

    type(view, '전반', '25');
    type(view, '팀 파울 기준', '6');
    view.save();
    await view.inSheet().findByRole('alert');
    type(view, '전반', '20');
    view.save();
    await view.saved();

    expect(backend.state.periodPatches.map((body) => body.periods)).toEqual([
      [{ durationMinutes: 25 }, { durationMinutes: 20 }],
      [{ durationMinutes: 20 }, { durationMinutes: 20 }],
    ]);
  });

  it('경기 시간이 0 이면 그 칸으로 가고 아무것도 보내지 않는다', async () => {
    const backend = start();
    const view = await open(backend);

    type(view, '후반', '0');
    type(view, '팀 파울 기준', '6');
    view.save();

    expect(view.inSheet().getByRole('alert')).toHaveTextContent('경기 시간은 1분 이상으로 입력해 주세요.');
    expect(view.inSheet().getByLabelText('후반')).toHaveFocus();
    expect(backend.state.periodPatches).toEqual([]);
    expect(backend.state.patches).toEqual([]);
  });

  it('대진에 있는 단계가 경기 시간의 단계 줄로 나온다', async () => {
    const backend = start();
    const group = (id: string, phase: string) => ({ id, tournamentId: 'tournament-1', name: id, phase, sortOrder: 0, advanceCount: null, createdAt: '', updatedAt: '', groupTeams: [] });
    backend.state.bracket = { ...backend.state.bracket, groups: [group('a', 'group'), group('b', 'group'), group('sf', 'semi'), group('f', 'final')] };
    const view = await open(backend);

    await waitFor(() =>
      expect(view.inSheet().getAllByRole('group', { name: / 경기 시간$/ }).map((row) => row.getAttribute('aria-label'))).toEqual([
        '조별리그 경기 시간', '4강 경기 시간', '결승 경기 시간',
      ]),
    );
  });
});

describe('경기 규칙 섹션 시트 — 출전 인원·교체', () => {
  it('출전 인원을 고르면 lineupMaxPlayers 만 보낸다', async () => {
    const backend = start();
    const view = await open(backend);
    const lineup = within(view.inSheet().getByRole('group', { name: '출전 인원' }));

    expect(lineup.getByRole('button', { name: '6명' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(lineup.getByRole('button', { name: '5명' }));
    view.save();
    await view.saved();

    expect(view.patchKeys()).toEqual(['lineupMaxPlayers']);
    expect(backend.state.patches[0].lineupMaxPlayers).toBe(5);
  });

  it('자유 교체에서 횟수 제한으로 바꾸면 횟수 기본값이 채워지고 함께 보낸다', async () => {
    const backend = start();
    const view = await open(backend);
    const substitution = within(view.inSheet().getByRole('group', { name: '교체' }));

    expect(substitution.getByRole('button', { name: '자유 교체' })).toHaveAttribute('aria-pressed', 'true');
    expect(view.inSheet().queryByLabelText('허용 교체 횟수')).toBeNull();
    fireEvent.click(substitution.getByRole('button', { name: '횟수 제한' }));
    expect(view.inSheet().getByLabelText('허용 교체 횟수')).toHaveValue('5');
    view.save();
    await view.saved();

    expect(view.patchKeys()).toEqual(['maxSubstitutions', 'substitutionMode']);
    expect(backend.state.patches[0]).toMatchObject({ substitutionMode: 'limited', maxSubstitutions: 5 });
  });

  it('횟수 제한에서 자유 교체로 바꾸면 횟수는 보내지 않는다', async () => {
    const backend = start({ substitutionMode: 'limited', maxSubstitutions: 3 });
    const view = await open(backend);

    expect(view.inSheet().getByLabelText('허용 교체 횟수')).toHaveValue('3');
    fireEvent.click(within(view.inSheet().getByRole('group', { name: '교체' })).getByRole('button', { name: '자유 교체' }));
    view.save();
    await view.saved();

    expect(view.patchKeys()).toEqual(['substitutionMode']);
    expect(backend.state.patches[0].substitutionMode).toBe('rolling');
  });

  it('허용 교체 횟수만 바꾸면 그 값만 보내고, 51 은 막는다', async () => {
    const backend = start({ substitutionMode: 'limited', maxSubstitutions: 3 });
    const view = await open(backend);

    type(view, '허용 교체 횟수', '51');
    view.save();
    expect(view.inSheet().getByLabelText('허용 교체 횟수')).toHaveAccessibleDescription('허용 교체 횟수는 0~50 사이로 입력해 주세요.');
    expect(backend.state.patches).toEqual([]);

    type(view, '허용 교체 횟수', '4');
    view.save();
    await view.saved();
    expect(view.patchKeys()).toEqual(['maxSubstitutions']);
    expect(backend.state.patches[0].maxSubstitutions).toBe(4);
  });

  it.each(['in_progress', 'completed'] as const)('%s 대회: 출전 인원·교체는 사유와 함께 잠기고, 팀 파울 기준은 저장된다', async (status) => {
    const backend = start({ status });
    const view = renderInfoSheet(rulesSection, backend);
    await view.inSheet().findByLabelText('전반');

    expect(view.inSheet().getByText(/대회가 시작된 뒤에는 출전 인원을 바꿀 수 없어요\. 지금 6명이에요\./)).toBeInTheDocument();
    expect(view.inSheet().getByText(/대회가 시작된 뒤에는 교체 방식을 바꿀 수 없어요\. 지금 자유 교체예요\./)).toBeInTheDocument();
    expect(view.inSheet().getAllByText(/꼭 바꿔야 하면 대회 설정 변경에서 소급 영향을 확인한 뒤 진행할 수 있어요\./)).toHaveLength(2);
    expect(view.inSheet().queryByRole('group', { name: '출전 인원' })).toBeNull();
    expect(view.inSheet().queryByRole('group', { name: '교체' })).toBeNull();

    type(view, '팀 파울 기준', '4');
    view.save();
    await view.saved();
    expect(view.patchKeys()).toEqual(['teamFoulThreshold']);
  });

  it('선택지를 불러오지 못하면 그렇게 알리고 지금 값을 보여 주며, 다른 칸 저장은 막지 않는다', async () => {
    const backend = start();
    backend.state.lineupOptionsStatus = 500;
    const view = renderInfoSheet(rulesSection, backend);

    expect(await view.inSheet().findByText(/출전 인원 선택지를 불러오지 못했어요\. 잠시 뒤 다시 시도해 주세요\. 지금 6명이에요\./)).toBeInTheDocument();
    expect(view.inSheet().getByText(/교체 선택지를 불러오지 못했어요\. 잠시 뒤 다시 시도해 주세요\. 지금 자유 교체예요\./)).toBeInTheDocument();
    type(view, '팀 파울 기준', '4');
    view.save();
    await view.saved();
    expect(view.patchKeys()).toEqual(['teamFoulThreshold']);
  });

  it('선택지가 없는 종목은 고를 수 없다고 알린다', async () => {
    const backend = start();
    backend.state.lineupOptions = { ...backend.state.lineupOptions, supported: false, options: [], substitutionModes: [] };
    const view = renderInfoSheet(rulesSection, backend);

    expect(await view.inSheet().findByText('이 종목은 아직 출전 인원을 고를 수 없어요.')).toBeInTheDocument();
    expect(view.inSheet().getByText('이 종목은 아직 교체 방식을 고를 수 없어요.')).toBeInTheDocument();
  });
});

describe('경기 규칙 섹션 시트 — 순위 정하는 순서', () => {
  it('지금 순서에 맞는 프리셋을 고른 채로 열리고, 다른 프리셋을 고르면 그 순서만 보낸다', async () => {
    const backend = start({ tieBreakOrder: DEFAULT_ORDER });
    const view = await open(backend);

    expect(view.inSheet().getByRole('heading', { name: '순위 정하는 순서' })).toBeInTheDocument();
    expect(view.inSheet().getByRole('radio', { name: /맞대결 우선/ })).toBeChecked();
    fireEvent.click(view.inSheet().getByRole('radio', { name: /득실차 우선/ }));
    view.save();
    await view.saved();

    expect(view.patchKeys()).toEqual(['tieBreakOrder']);
    expect(backend.state.patches[0].tieBreakOrder).toEqual(GOALS_FIRST);
  });

  it('직접 정하기로 순서를 옮겨 적용하면 그 순서를 보낸다', async () => {
    const backend = start({ tieBreakOrder: DEFAULT_ORDER });
    const view = await open(backend);

    fireEvent.click(view.inSheet().getByRole('radio', { name: /직접 정하기/ }));
    const custom = screen.getByRole('dialog', { name: '직접 정하기' });
    fireEvent.click(within(custom).getByRole('button', { name: '페어플레이 한 칸 위로' }));
    fireEvent.click(within(custom).getByRole('button', { name: '이 순서로 정하기' }));
    view.save();
    await view.saved();

    expect(backend.state.patches[0].tieBreakOrder).toEqual(['points', 'head_to_head', 'goal_difference', 'fair_play', 'goals_for', 'fewest_goals_against', 'seeded_draw']);
  });

  it('기본 프리셋으로 되돌리면 null 을 보낸다', async () => {
    const backend = start({ tieBreakOrder: GOALS_FIRST });
    const view = await open(backend);

    fireEvent.click(view.inSheet().getByRole('radio', { name: /맞대결 우선/ }));
    view.save();
    await view.saved();

    expect(view.patchKeys()).toEqual(['tieBreakOrder']);
    expect(backend.state.patches[0].tieBreakOrder).toBeNull();
  });

  it('순서를 건드리지 않고 다른 칸만 고치면 순서를 보내지 않는다', async () => {
    const backend = start({ tieBreakOrder: GOALS_FIRST });
    const view = await open(backend);

    type(view, '팀 파울 기준', '4');
    view.save();
    await view.saved();

    expect(view.patchKeys()).toEqual(['teamFoulThreshold']);
  });

  it('결과가 확정돼 잠기면 서버가 준 사유를 보여 주고 카드를 끄며, 다른 칸 저장은 막지 않는다', async () => {
    const reason = '이 순서를 따르는 단계의 경기 결과가 확정돼서 바꿀 수 없어요.';
    const backend = start({ tieBreakOrder: GOALS_FIRST, tieBreakOrderBlockedReason: reason });
    const view = await open(backend);

    expect(view.inSheet().getByText(reason)).toBeInTheDocument();
    for (const radio of view.inSheet().getAllByRole('radio')) expect(radio).toBeDisabled();
    type(view, '팀 파울 기준', '4');
    view.save();
    await view.saved();
    expect(view.patchKeys()).toEqual(['teamFoulThreshold']);
  });

  it('조별 순위가 없는 토너먼트만 대회에는 순서 칸이 없다', async () => {
    const view = await open(start({ format: 'knockout' }));

    expect(view.inSheet().queryByRole('heading', { name: '순위 정하는 순서' })).toBeNull();
  });

  it('여러 단계 대회는 단계마다 고르는 칸이 함께 있고, 고르면 단계 구성 revision 과 함께 바로 저장한다', async () => {
    const backend = start({
      stagePlanRevision: 7,
      stageTieBreak: {
        tournamentOrder: DEFAULT_ORDER,
        stages: [
          { stageKey: 'preliminary', stageName: '예선 조별리그', ranked: true, order: null, resolvedOrder: DEFAULT_ORDER, lockedReason: null },
          { stageKey: 'final', stageName: '결선 토너먼트', ranked: false, order: null, resolvedOrder: [], lockedReason: null },
        ],
      } as V1Tournament['stageTieBreak'],
    });
    const view = await open(backend);

    expect(view.inSheet().getByText(/단계마다 고르면 바로 저장돼요\./)).toBeInTheDocument();
    fireEvent.change(view.inSheet().getByLabelText('1단계 · 예선 조별리그'), { target: { value: 'goals_for_first' } });

    await waitFor(() => expect(backend.state.stageTieBreakPuts).toEqual([
      { stageKey: 'preliminary', expectedRevision: 7, order: ['points', 'goals_for', 'goal_difference', 'fewest_goals_against', 'head_to_head', 'fair_play', 'seeded_draw'] },
    ]));
    expect(backend.state.patches).toEqual([]);
  });

  it('대조군: 단계 구성이 없는 대회에는 단계마다 고르는 칸이 없다', async () => {
    const view = await open(start());

    expect(view.inSheet().queryByText(/단계마다 고르면 바로 저장돼요\./)).toBeNull();
  });
});

describe('경기 규칙 섹션 시트 — 6강 방식', () => {
  it('6팀 토너먼트에서 고른 방식만 보낸다', async () => {
    const backend = start({ format: 'knockout', teamCount: 6, sixTeamMode: false });
    const view = await open(backend);

    expect(view.inSheet().queryByRole('heading', { name: '결승 직행팀 고르는 순서' })).toBeNull();
    fireEvent.change(view.inSheet().getByLabelText('6팀 토너먼트 진행'), { target: { value: 'six' } });
    view.save();
    await view.saved();

    expect(view.patchKeys()).toEqual(['sixTeamMode']);
    expect(backend.state.patches[0].sixTeamMode).toBe(true);
  });

  it.each([
    ['8팀 토너먼트', { format: 'knockout', teamCount: 8 }],
    ['6팀 조별리그 → 토너먼트', { format: 'group_knockout', teamCount: 6 }],
  ] as const)('대조군: %s 에는 6강 방식 칸이 없다', async (_label, overrides) => {
    const view = await open(start(overrides));

    expect(view.inSheet().queryByLabelText('6팀 토너먼트 진행')).toBeNull();
  });

  it('이미 고른 6강 방식은 채워져 열리고 다른 칸 수정에 끼지 않는다', async () => {
    const backend = start(sixTeam);
    const view = await open(backend);

    expect(view.inSheet().getByLabelText('6팀 토너먼트 진행')).toHaveValue('six');
    type(view, '팀 파울 기준', '4');
    view.save();
    await view.saved();

    expect(view.patchKeys()).toEqual(['teamFoulThreshold']);
  });

  it('결승 직행 순서를 옮기면 바뀐 순서만 보내고, 기본 순서로 되돌리면 null 을 보낸다', async () => {
    const backend = start(sixTeam);
    const view = await open(backend);

    expect(view.inSheet().getByText('운영자 선택')).toBeInTheDocument();
    fireEvent.click(view.inSheet().getByRole('button', { name: '득실차 한 칸 위로' }));
    view.save();
    await view.saved();
    expect(view.patchKeys()).toEqual(['sixTeamDirectFinalOrder']);
    expect(backend.state.patches[0].sixTeamDirectFinalOrder).toEqual(['goal_difference', 'goals_for', 'fewest_goals_against']);
  });

  it('기본 순서로 되돌리면 null 을 보낸다', async () => {
    const backend = start({ ...sixTeam, sixTeamDirectFinalOrder: ['goal_difference', 'goals_for', 'fewest_goals_against'] });
    const view = await open(backend);

    fireEvent.click(view.inSheet().getByRole('button', { name: '기본 순서로 되돌리기' }));
    view.save();
    await view.saved();

    expect(view.patchKeys()).toEqual(['sixTeamDirectFinalOrder']);
    expect(backend.state.patches[0].sixTeamDirectFinalOrder).toBeNull();
  });

  it('6강 대진이 만들어졌으면 방식을 잠그고, 결과가 확정됐으면 순서도 사유와 함께 잠근다', async () => {
    const reason = '6강 경기 결과가 확정돼서 바꿀 수 없어요.';
    const view = await open(start({ ...sixTeam, sixTeamBracket: {} as V1Tournament['sixTeamBracket'], sixTeamDirectFinalOrderBlockedReason: reason }));

    expect(view.inSheet().getByLabelText('6팀 토너먼트 진행')).toBeDisabled();
    expect(view.inSheet().getByText(reason)).toBeInTheDocument();
    expect(view.inSheet().getByRole('button', { name: '득실차 한 칸 위로' })).toBeDisabled();
  });
});

describe('경기 규칙 섹션 시트 — 징계', () => {
  it('비워 둔 팀 파울 기준은 빈칸과 「비우면 5개」 안내로 열린다', async () => {
    const view = await open(start({ teamFoulThreshold: null }));

    expect(view.inSheet().getByLabelText('팀 파울 기준')).toHaveValue('');
    expect(view.inSheet().getByLabelText('팀 파울 기준')).toHaveAccessibleDescription(/비우면 5개예요/);
  });

  it('정한 대회는 그 개수로 채워 열리고, 칸을 비우면 null 을 명시적으로 보낸다', async () => {
    const backend = start({ teamFoulThreshold: 6 });
    const view = await open(backend);

    expect(view.inSheet().getByLabelText('팀 파울 기준')).toHaveValue('6');
    type(view, '팀 파울 기준', '');
    view.save();
    await view.saved();

    expect(view.patchKeys()).toEqual(['teamFoulThreshold']);
    expect(backend.state.patches[0].teamFoulThreshold).toBeNull();
  });

  it('건드리지 않으면 팀 파울 기준을 보내지 않는다', async () => {
    const backend = start({ teamFoulThreshold: 6 });
    const view = await open(backend);

    type(view, '경고 누적 출전정지', '3');
    view.save();
    await view.saved();

    expect(view.patchKeys()).toEqual(['yellowAccumulationLimit']);
    expect(backend.state.patches[0].yellowAccumulationLimit).toBe(3);
  });

  it.each(['0', '21', '2.5'])('팀 파울 기준 %s 은 저장하지 않고 칸 아래에 이유를 알린다', async (bad) => {
    const backend = start();
    const view = await open(backend);

    type(view, '팀 파울 기준', bad);
    view.save();

    expect(view.inSheet().getByLabelText('팀 파울 기준')).toHaveAccessibleDescription(/1부터 20 사이의 정수/);
    expect(view.inSheet().getByLabelText('팀 파울 기준')).toHaveFocus();
    expect(backend.state.patches).toEqual([]);
  });

  it.each([
    ['경고 누적 출전정지', '21'],
    ['퇴장 출전정지', '0'],
    ['퇴장 출전정지', 'abc'],
  ])('%s %s 은 저장하지 않는다', async (label, bad) => {
    const backend = start();
    const view = await open(backend);

    type(view, label, bad);
    view.save();

    expect(view.inSheet().getByLabelText(label)).toHaveAccessibleDescription('출전정지 기준은 1~20 사이의 정수로 적어 주세요.');
    expect(backend.state.patches).toEqual([]);
  });

  it('켜 둔 출전정지 기준을 비우면 null 을 보내 끈다', async () => {
    const backend = start({ yellowAccumulationLimit: 3, redCardSuspensionMatches: 1 });
    const view = await open(backend);

    type(view, '경고 누적 출전정지', '');
    type(view, '퇴장 출전정지', '2');
    view.save();
    await view.saved();

    expect(view.patchKeys()).toEqual(['redCardSuspensionMatches', 'yellowAccumulationLimit']);
    expect(backend.state.patches[0]).toMatchObject({ yellowAccumulationLimit: null, redCardSuspensionMatches: 2 });
  });
});

describe('경기 규칙 섹션 요약 카드', () => {
  const settings = createTournamentInfoServer().state;
  const context = (overrides: Partial<V1Tournament> = {}, extra: Partial<InfoSummaryContext> = {}): InfoSummaryContext => ({
    tournament: createTournamentInfoFixture(overrides),
    lineupOptions: settings.lineupOptions,
    periods: settings.periods,
    ...extra,
  });
  const rows = (ctx: InfoSummaryContext) => {
    render(<InfoSummaryCard definition={rulesSection} context={ctx} canWrite onEdit={vi.fn()} />);
    return within(screen.getByRole('region', { name: '경기 규칙' }));
  };
  const rowOf = (card: ReturnType<typeof rows>, label: string) => within(card.getByText(label).nextElementSibling as HTMLElement);

  it('종목 기본값과 같은 값에는 「종목 기본값」·「기본값」 이 붙는다', () => {
    const card = rows(context());

    expect(rowOf(card, '출전 인원').getByText('6명')).toBeInTheDocument();
    expect(rowOf(card, '출전 인원').getByText('종목 기본값')).toBeInTheDocument();
    expect(rowOf(card, '경기 시간').getByText('전·후반 20분 / 20분')).toBeInTheDocument();
    expect(rowOf(card, '경기 시간').getByText('종목 기본값')).toBeInTheDocument();
    expect(rowOf(card, '경기 시간').getByText('모든 단계가 같은 시간이에요.')).toBeInTheDocument();
    expect(rowOf(card, '교체').getByText('자유 교체')).toBeInTheDocument();
    expect(rowOf(card, '교체').getByText('종목 기본값')).toBeInTheDocument();
    expect(rowOf(card, '순위 정하는 순서').getByText('맞대결 우선')).toBeInTheDocument();
    expect(rowOf(card, '순위 정하는 순서').getByText('기본값')).toBeInTheDocument();
    expect(rowOf(card, '징계').getByText('팀 파울 5개')).toBeInTheDocument();
    expect(rowOf(card, '징계').getByText('기본값')).toBeInTheDocument();
    expect(rowOf(card, '징계').getByText('경고 누적·퇴장 출전정지는 정하지 않았어요.')).toBeInTheDocument();
  });

  it('대조군: 기본값과 다른 값에는 배지가 없다', () => {
    const period = (durationMinutes: number) => ({ code: 'P', label: '', durationMinutes, extraTime: false });
    const card = rows(context(
      { lineupMaxPlayers: 5, substitutionMode: 'limited', maxSubstitutions: 3, tieBreakOrder: GOALS_FIRST, teamFoulThreshold: 6, yellowAccumulationLimit: 3, redCardSuspensionMatches: 1 },
      { periods: { ...settings.periods, periods: [period(15), period(15)], stageOverrides: [{ phase: 'group', competitionConfigVersionId: 'c', periods: [period(10)], legacyPeriodCount: null }] } },
    ));

    expect(card.queryByText('종목 기본값')).toBeNull();
    expect(card.queryByText('기본값')).toBeNull();
    expect(rowOf(card, '출전 인원').getByText('5명')).toBeInTheDocument();
    expect(rowOf(card, '경기 시간').getByText('전·후반 15분 / 15분')).toBeInTheDocument();
    expect(rowOf(card, '경기 시간').getByText('조별리그만 다른 시간이에요.')).toBeInTheDocument();
    expect(rowOf(card, '교체').getByText('횟수 제한 3회')).toBeInTheDocument();
    expect(rowOf(card, '순위 정하는 순서').getByText('득실차 우선')).toBeInTheDocument();
    expect(rowOf(card, '징계').getByText('팀 파울 6개')).toBeInTheDocument();
    expect(rowOf(card, '징계').getByText('경고 누적 3장 · 퇴장 1경기 출전정지')).toBeInTheDocument();
  });

  it('순위 줄은 토너먼트만 대회에 없고, 6강 방식 줄은 6팀 토너먼트에만 있다', () => {
    const knockout = rows(context({ format: 'knockout', teamCount: 6, sixTeamMode: true }));

    expect(knockout.queryByText('순위 정하는 순서')).toBeNull();
    expect(rowOf(knockout, '6강 방식').getByText('6강 · 승리팀 중 1팀 결승 직행')).toBeInTheDocument();
  });

  it('대조군: 조별리그 → 토너먼트 대회에는 6강 방식 줄이 없다', () => {
    expect(rows(context()).queryByText('6강 방식')).toBeNull();
  });
});
