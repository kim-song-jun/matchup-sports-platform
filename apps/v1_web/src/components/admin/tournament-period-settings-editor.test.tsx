import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { usePatchPeriods, type TournamentPeriodPhase } from '@/hooks/use-tournament-period-settings';
import { setupTournamentInfoBackend } from '@/test/tournament-info-sheet';
import {
  PeriodSettingsFields,
  TournamentPeriodSettingsEditor,
  usePeriodSettingsDraft,
} from './tournament-period-settings-editor';

const start = setupTournamentInfoBackend();
type Backend = ReturnType<typeof start>;

const period = (durationMinutes: number) => ({ code: 'P', label: '', durationMinutes, extraTime: false });

function Host({ stagePhases }: { stagePhases: readonly TournamentPeriodPhase[] }) {
  const draft = usePeriodSettingsDraft({ tournamentId: 'tournament-1', stagePhases });
  const patchPeriods = usePatchPeriods('tournament-1');
  const [result, setResult] = useState('');
  return (
    <>
      <PeriodSettingsFields draft={draft} disabled={false} />
      <output data-testid="dirty">{String(draft.dirty)}</output>
      <output data-testid="invalid">{draft.invalid?.message ?? ''}</output>
      <output data-testid="result">{result}</output>
      <button
        type="button"
        onClick={async () => {
          const steps = draft.buildSteps(patchPeriods);
          for (const step of steps) await step.run();
          setResult(`${steps.length}단계 끝`);
        }}
      >
        단계 실행
      </button>
    </>
  );
}

function wrap(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

async function mountHost(stagePhases: readonly TournamentPeriodPhase[] = []) {
  wrap(<Host stagePhases={stagePhases} />);
  await screen.findByLabelText('전반');
}
const run = async (expected: string) => {
  fireEvent.click(screen.getByRole('button', { name: '단계 실행' }));
  await waitFor(() => expect(screen.getByTestId('result')).toHaveTextContent(expected));
};
const stageRow = (name: string) => within(screen.getByRole('group', { name: `${name} 경기 시간` }));

describe('usePeriodSettingsDraft + PeriodSettingsFields', () => {
  it('저장된 시간을 채우고, 바꾸지 않으면 보낼 단계가 없다', async () => {
    const backend = start();
    await mountHost();

    expect(screen.getByLabelText('전반')).toHaveValue('20');
    expect(screen.getByLabelText('후반')).toHaveValue('20');
    expect(screen.getByText('한 경기 40분 · 연장은 빼고 정해요.')).toBeInTheDocument();
    expect(screen.getByTestId('dirty')).toHaveTextContent('false');
    await run('0단계 끝');
    expect(backend.state.periodPatches).toEqual([]);
  });

  it('전반만 바꾸면 PATCH 본문은 expectedVersion 과 periods 두 칸뿐이다', async () => {
    const backend = start();
    await mountHost();

    fireEvent.change(screen.getByLabelText('전반'), { target: { value: '25' } });
    expect(screen.getByTestId('dirty')).toHaveTextContent('true');
    await run('1단계 끝');

    expect(backend.state.periodPatches).toEqual([
      { expectedVersion: '2026-11-01T00:00:00.000Z', periods: [{ durationMinutes: 25 }, { durationMinutes: 20 }] },
    ]);
  });

  it('단판으로 바꾸면 합친 시간 한 칸을 보내고, 다시 전·후반으로 나눌 수 있다', async () => {
    const backend = start();
    await mountHost();
    const split = within(screen.getByRole('group', { name: '경기 시간 나누기' }));

    expect(split.getByRole('button', { name: '전·후반' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(split.getByRole('button', { name: '단판' }));
    expect(screen.getByLabelText('단판')).toHaveValue('40');
    expect(split.getByRole('button', { name: '단판' })).toHaveAttribute('aria-pressed', 'true');
    await run('1단계 끝');

    expect(backend.state.periodPatches[0].periods).toEqual([{ durationMinutes: 40 }]);
    fireEvent.click(split.getByRole('button', { name: '전·후반' }));
    expect(screen.getByLabelText('전반')).toHaveValue('20');
  });

  it('대진에 있는 단계만 줄로 나오고, 단계를 고르는 select 는 없다', async () => {
    start();
    await mountHost(['group', 'semi', 'final']);

    expect(screen.getAllByRole('group', { name: / 경기 시간$/ }).map((row) => row.getAttribute('aria-label'))).toEqual([
      '조별리그 경기 시간', '4강 경기 시간', '결승 경기 시간',
    ]);
    expect(stageRow('결승').getByText('위 시간 그대로')).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('단계의 「바꾸기」 로 시간을 적으면 그 단계만 보낸다', async () => {
    const backend = start();
    await mountHost(['group', 'final']);

    fireEvent.click(stageRow('결승').getByRole('button', { name: '결승 경기 시간 바꾸기' }));
    expect(screen.getByTestId('dirty')).toHaveTextContent('false');
    fireEvent.change(stageRow('결승').getByLabelText('결승 전반'), { target: { value: '30' } });
    fireEvent.change(stageRow('결승').getByLabelText('결승 후반'), { target: { value: '30' } });
    await run('1단계 끝');

    expect(backend.state.periodPatches).toEqual([
      { expectedVersion: '2026-11-01T00:00:00.000Z', phase: 'final', periods: [{ durationMinutes: 30 }, { durationMinutes: 30 }] },
    ]);
  });

  it('펼치기만 하고 적지 않은 단계는 보내지 않는다', async () => {
    const backend = start();
    await mountHost(['final']);

    fireEvent.click(stageRow('결승').getByRole('button', { name: '결승 경기 시간 바꾸기' }));
    await run('0단계 끝');

    expect(backend.state.periodPatches).toEqual([]);
  });

  it('따로 정해 둔 단계는 대진에 없어도 줄이 나오고, 「위 시간 그대로 쓰기」 는 inheritDefault 를 보낸다', async () => {
    const backend = start();
    backend.state.periods = {
      ...backend.state.periods,
      stageOverrides: [{ phase: 'final', competitionConfigVersionId: 'c-final', periods: [period(30), period(30)], legacyPeriodCount: null }],
    };
    await mountHost([]);

    expect(stageRow('결승').getByText('30분 / 30분')).toBeInTheDocument();
    fireEvent.click(stageRow('결승').getByRole('button', { name: '결승 경기 시간 바꾸기' }));
    fireEvent.click(stageRow('결승').getByRole('button', { name: '위 시간 그대로 쓰기' }));
    expect(stageRow('결승').getByText('위 시간 그대로')).toBeInTheDocument();
    await run('1단계 끝');

    expect(backend.state.periodPatches).toEqual([
      { expectedVersion: '2026-11-01T00:00:00.000Z', phase: 'final', inheritDefault: true },
    ]);
  });

  it('기본 시간과 단계 시간을 함께 바꾸면 기본 → 단계 순서로, 각각 직전 저장이 올린 버전으로 보낸다', async () => {
    const backend = start();
    await mountHost(['final']);

    fireEvent.change(screen.getByLabelText('전반'), { target: { value: '25' } });
    fireEvent.click(stageRow('결승').getByRole('button', { name: '결승 경기 시간 바꾸기' }));
    fireEvent.change(stageRow('결승').getByLabelText('결승 전반'), { target: { value: '30' } });
    await run('2단계 끝');

    expect(backend.state.periodPatches.map((body) => body.phase ?? 'default')).toEqual(['default', 'final']);
    expect(backend.state.periodPatches[1].expectedVersion).not.toBe(backend.state.periodPatches[0].expectedVersion);
    expect(backend.state.periodPatches[1].expectedVersion).toBe('2026-11-01T00:00:01.000Z');
  });

  it.each(['0', ''])('시간이 %j 이면 저장할 수 없다고 알리고 단계를 만들지 않는다', async (value) => {
    const backend = start();
    await mountHost();

    fireEvent.change(screen.getByLabelText('후반'), { target: { value } });

    expect(screen.getByTestId('invalid')).toHaveTextContent('경기 시간은 1분 이상으로 입력해 주세요.');
    await run('0단계 끝');
    expect(backend.state.periodPatches).toEqual([]);
  });

  it('전·후반도 단판도 아닌 옛 설정은 나누기 버튼 없이 칸마다 n부로 보여 준다', async () => {
    const backend = start();
    backend.state.periods = { ...backend.state.periods, periods: [period(10), period(10), period(10)] };
    wrap(<Host stagePhases={[]} />);

    expect(await screen.findByLabelText('1부')).toHaveValue('10');
    expect(screen.getByLabelText('3부')).toHaveValue('10');
    expect(screen.queryByRole('group', { name: '경기 시간 나누기' })).toBeNull();
  });

  it('길이 없이 개수만 저장된 옛 설정은 빈 칸으로 열고 입력을 안내하되, 손대지 않으면 다른 저장을 막지 않는다', async () => {
    const backend = start();
    backend.state.periods = { ...backend.state.periods, periods: null, legacyPeriodCount: 2, requiresDurationInput: true };
    wrap(<Host stagePhases={[]} />);

    expect(await screen.findByLabelText('전반')).toHaveValue('');
    expect(screen.getByText(/각 길이를 입력해 주세요/)).toBeInTheDocument();
    expect(screen.getByTestId('invalid')).toHaveTextContent('');
    expect(screen.getByTestId('dirty')).toHaveTextContent('false');

    fireEvent.change(screen.getByLabelText('전반'), { target: { value: '20' } });
    expect(screen.getByTestId('invalid')).toHaveTextContent('경기 시간은 1분 이상으로 입력해 주세요.');
    fireEvent.change(screen.getByLabelText('후반'), { target: { value: '20' } });
    await run('1단계 끝');
    expect(backend.state.periodPatches[0].periods).toEqual([{ durationMinutes: 20 }, { durationMinutes: 20 }]);
  });

  it('따로 정한 조·경기와 단계·편성 시간은 읽기 안내로 남기고, 화면 어디에도 「피리어드」 가 없다', async () => {
    const backend = start();
    backend.state.periods = {
      ...backend.state.periods,
      groupOverrides: [{ groupId: 'g-a', name: 'A조', competitionConfigVersionId: 'c-a', periods: [period(15)], legacyPeriodCount: null }],
      matchOverrideCount: 2,
      compositionOverrides: [
        { scope: 'stage', key: 'pre', competitionConfigVersionId: 'c-stage', periods: [period(15)] },
        { scope: 'pool', key: 'pool-a', competitionConfigVersionId: 'c-pool', periods: [period(10)] },
      ],
    };
    const onClick = vi.fn();
    const draftHost = () => {
      const draft = usePeriodSettingsDraft({ tournamentId: 'tournament-1', stagePhases: ['group'] });
      return (
        <PeriodSettingsFields
          draft={draft}
          disabled={false}
          compositionLink={{ href: '/tournament-management/tournaments/tournament-1/bracket', onClick }}
          stagePlan={{ version: 1, stages: [{ key: 'pre', name: '예선', pools: [{ key: 'pool-a', name: 'A조', format: 'league', capacity: 4, legs: 1, sources: [] }] }] }}
        />
      );
    };
    const DraftHost = draftHost;
    const view = wrap(<DraftHost />);
    await screen.findByLabelText('전반');

    expect(screen.getByText('따로 정한 조: A조')).toBeInTheDocument();
    expect(screen.getByText('따로 정한 경기: 2개')).toBeInTheDocument();
    expect(screen.getByText('예선 전체 · 15분')).toBeInTheDocument();
    expect(screen.getByText('예선 · A조 · 10분')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: '단계·편성 경기 시간 수정' });
    expect(link).toHaveAttribute('href', '/tournament-management/tournaments/tournament-1/bracket');
    fireEvent.click(link);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(view.container.textContent).not.toContain('피리어드');
  });

  it('이동 링크를 받지 않은 쪽(리그 경기 시간)에는 단계·편성 안내만 있고 링크는 없다', async () => {
    const backend = start();
    backend.state.periods = {
      ...backend.state.periods,
      compositionOverrides: [{ scope: 'stage', key: 'pre', competitionConfigVersionId: 'c-stage', periods: [period(15)] }],
    };
    const NoLinkHost = () => <PeriodSettingsFields draft={usePeriodSettingsDraft({ tournamentId: 'tournament-1', stagePhases: [] })} disabled={false} />;
    wrap(<NoLinkHost />);
    await screen.findByLabelText('전반');

    expect(screen.getByLabelText('단계·편성별 경기 시간 안내')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '단계·편성 경기 시간 수정' })).toBeNull();
  });
});

describe('TournamentPeriodSettingsEditor — 리그 경기 규칙의 경기 시간 카드', () => {
  const league = (backend: Backend) => {
    backend.state.periods = { ...backend.state.periods, kind: 'regular_league' };
    return backend;
  };

  it('요약을 보여 주고, 수정 → 시트에서 저장하면 요약이 새 값으로 바뀐다', async () => {
    const backend = league(start());
    const showToast = vi.fn();
    wrap(<TournamentPeriodSettingsEditor tournamentId="tournament-1" canWrite showToast={showToast} />);
    const card = within(await screen.findByRole('region', { name: '경기 시간' }));

    expect(await card.findByText('전·후반 20분 / 20분')).toBeInTheDocument();
    fireEvent.click(card.getByRole('button', { name: '경기 시간 수정' }));
    const sheet = within(await screen.findByRole('dialog', { name: '경기 시간' }));
    fireEvent.change(await sheet.findByLabelText('전반'), { target: { value: '25' } });
    fireEvent.change(sheet.getByLabelText('후반'), { target: { value: '25' } });
    fireEvent.click(sheet.getByRole('button', { name: '저장' }));

    await waitFor(() => expect(showToast).toHaveBeenCalledWith('경기 시간을 저장했어요.', 'success'));
    expect(backend.state.periodPatches).toEqual([
      { expectedVersion: '2026-11-01T00:00:00.000Z', periods: [{ durationMinutes: 25 }, { durationMinutes: 25 }] },
    ]);
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '경기 시간' })).toBeNull());
    expect(await card.findByText('전·후반 25분 / 25분')).toBeInTheDocument();
  });

  it('리그에는 단계 줄이 없다', async () => {
    league(start());
    wrap(<TournamentPeriodSettingsEditor tournamentId="tournament-1" canWrite showToast={vi.fn()} />);
    const card = within(await screen.findByRole('region', { name: '경기 시간' }));
    fireEvent.click(await card.findByRole('button', { name: '경기 시간 수정' }));
    const sheet = within(await screen.findByRole('dialog', { name: '경기 시간' }));
    await sheet.findByLabelText('전반');

    expect(sheet.queryByText('단계마다 다르게')).toBeNull();
  });

  it('저장이 실패하면 시트 안에 알리고 입력을 지킨다', async () => {
    const backend = league(start());
    const showToast = vi.fn();
    wrap(<TournamentPeriodSettingsEditor tournamentId="tournament-1" canWrite showToast={showToast} />);
    const card = within(await screen.findByRole('region', { name: '경기 시간' }));
    fireEvent.click(await card.findByRole('button', { name: '경기 시간 수정' }));
    const sheet = within(await screen.findByRole('dialog', { name: '경기 시간' }));
    backend.state.failNext('periods', 409, { code: 'TOURNAMENT_VERSION_CONFLICT' });

    fireEvent.change(await sheet.findByLabelText('전반'), { target: { value: '25' } });
    fireEvent.click(sheet.getByRole('button', { name: '저장' }));

    expect(await sheet.findByRole('alert')).toHaveTextContent('다른 곳에서 먼저 저장돼서 이번 저장은 반영되지 않았어요.');
    expect(sheet.getByLabelText('전반')).toHaveValue('25');
    expect(showToast).not.toHaveBeenCalled();
  });

  it('0분은 시트 안에서 막고 요청하지 않는다', async () => {
    const backend = league(start());
    wrap(<TournamentPeriodSettingsEditor tournamentId="tournament-1" canWrite showToast={vi.fn()} />);
    const card = within(await screen.findByRole('region', { name: '경기 시간' }));
    fireEvent.click(await card.findByRole('button', { name: '경기 시간 수정' }));
    const sheet = within(await screen.findByRole('dialog', { name: '경기 시간' }));

    fireEvent.change(await sheet.findByLabelText('전반'), { target: { value: '0' } });
    fireEvent.click(sheet.getByRole('button', { name: '저장' }));

    expect(sheet.getByRole('alert')).toHaveTextContent('경기 시간은 1분 이상으로 입력해 주세요.');
    expect(backend.state.periodPatches).toEqual([]);
  });

  it('읽기 전용 역할에게는 수정 버튼이 없다', async () => {
    league(start());
    wrap(<TournamentPeriodSettingsEditor tournamentId="tournament-1" canWrite={false} showToast={vi.fn()} />);
    const card = within(await screen.findByRole('region', { name: '경기 시간' }));

    expect(await card.findByText('전·후반 20분 / 20분')).toBeInTheDocument();
    expect(card.queryByRole('button', { name: '경기 시간 수정' })).toBeNull();
  });
});
