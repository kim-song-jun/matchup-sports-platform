'use client';

import { useId, useState } from 'react';
import { periodLabels, switchPeriodCount, tournamentPeriodPhaseLabel } from '@/app/admin/tournaments/new/tournament-create-model';
import {
  useTournamentMatchPeriods,
  useTournamentPeriodSettings,
  useUpdateTournamentPeriodSettings,
  type TournamentPeriodSetting,
} from '@/hooks/use-tournament-period-settings';

/** 경기 방식 선택 — 위 설정을 따르거나(inherit) 이 조·경기만 따로 정한다(custom). minutes 는 custom 으로 보낼 분이다. */
export type PeriodOverrideChoice = { mode: 'inherit' | 'custom'; minutes: string[] };

type Periods = ReadonlyArray<Pick<TournamentPeriodSetting, 'durationMinutes'>> | null | undefined;

/** "단판 15분" · "전·후반 각 20분" · "전반 20분 · 후반 25분". */
export function describePeriods(periods: Periods): string {
  if (!periods?.length) return '시간 미정';
  if (periods.length === 1) return `단판 ${periods[0].durationMinutes}분`;
  const names = periodLabels(periods.length);
  if (periods.length === 2 && periods[0].durationMinutes === periods[1].durationMinutes) return `전·후반 각 ${periods[0].durationMinutes}분`;
  return periods.map((period, index) => `${names[index]} ${period.durationMinutes}분`).join(' · ');
}

const minutesOf = (periods: Periods) => (periods ?? []).map((period) => String(period.durationMinutes));

function choiceFor(overridden: boolean, own: Periods, inherited: Periods): PeriodOverrideChoice {
  // 위 설정을 따르는 중이면 "따로" 칸을 위 설정 값으로 채워 둔다 — 고칠 곳만 바꾸면 된다.
  return { mode: overridden ? 'custom' : 'inherit', minutes: minutesOf(overridden ? own : inherited) };
}

/** 저장할 본문. 바뀐 게 없으면 null 이다. */
export function periodOverridePayload(initial: PeriodOverrideChoice, choice: PeriodOverrideChoice) {
  if (choice.mode === 'inherit') return initial.mode === 'inherit' ? null : { inheritDefault: true as const };
  const minutes = choice.minutes.map((value) => value.trim());
  if (initial.mode === 'custom' && minutes.join(',') === initial.minutes.join(',')) return null;
  return { periods: minutes.map((value) => ({ durationMinutes: Number(value) })) };
}

export function periodOverrideError(choice: PeriodOverrideChoice): string | null {
  if (choice.mode === 'inherit') return null;
  return choice.minutes.length === 0 || choice.minutes.some((value) => !/^\d+$/.test(value.trim()) || Number(value) < 1 || Number(value) > 240)
    ? '경기 시간은 피리어드마다 1~240분 사이의 정수로 입력해 주세요.'
    : null;
}

/** 수정 창이 바꾼 값을 들고 있다가 열린 대상이 바뀌면 서버 값으로 다시 연다. */
function useDraft(targetId: string | null, initial: PeriodOverrideChoice | null) {
  const [draft, setDraft] = useState<{ targetId: string; choice: PeriodOverrideChoice } | null>(null);
  const choice = draft !== null && draft.targetId === targetId ? draft.choice : initial;
  const payload = initial && choice ? periodOverridePayload(initial, choice) : null;
  return {
    choice,
    payload,
    error: choice ? periodOverrideError(choice) : null,
    setChoice: (next: PeriodOverrideChoice) => { if (targetId) setDraft({ targetId, choice: next }); },
  };
}

/**
 * 대회·리그 경기 하나의 경기 방식. 저장은 그 경기에만 한다 — 조·단계·대회 기본 설정은 바뀌지 않는다.
 * `defaultLabel` 은 위 설정이 대회 기본값일 때 부를 이름("대회 기본값"·"리그 기본값")이다.
 */
export function useMatchPeriodOverride(tournamentId: string, teamMatchId: string | null, defaultLabel: string) {
  const query = useTournamentMatchPeriods(tournamentId, teamMatchId);
  const update = useUpdateTournamentPeriodSettings(tournamentId);
  const data = query.data?.teamMatchId === teamMatchId ? query.data : undefined;
  const initial = data ? choiceFor(data.overridden, data.periods, data.inherited.periods) : null;
  const draft = useDraft(teamMatchId, initial);
  const sourceLabel = !data ? '' : data.inherited.source === 'group'
    ? `${data.inherited.groupName ?? '조'} 설정`
    : data.inherited.source === 'stage' && data.inherited.phase
      ? `${tournamentPeriodPhaseLabel(data.inherited.phase)} 설정`
      : defaultLabel;
  return {
    ...draft,
    status: query.isPending && teamMatchId ? 'loading' as const : query.isError || (teamMatchId && !data) ? 'error' as const : 'ready' as const,
    inheritedSummary: data ? `${sourceLabel} · ${describePeriods(data.inherited.periods)}` : '',
    lockedReason: data && !data.editable ? '이미 시작했거나 끝난 경기라 경기 방식을 바꿀 수 없어요.' : null,
    pending: update.isPending,
    save: async () => {
      if (!data || !draft.payload) return false;
      await update.mutateAsync({ expectedVersion: data.expectedVersion, teamMatchId: data.teamMatchId, ...draft.payload });
      return true;
    },
  };
}

/** 조별리그 조 하나의 경기 방식. 위 설정은 조별리그 단계 설정, 없으면 대회 기본값이다. */
export function useGroupPeriodOverride(tournamentId: string, groupId: string | null) {
  const query = useTournamentPeriodSettings(tournamentId, { enabled: groupId !== null });
  const update = useUpdateTournamentPeriodSettings(tournamentId);
  const data = query.data;
  const own = data?.groupOverrides.find((group) => group.groupId === groupId);
  const stage = data?.stageOverrides.find((override) => override.phase === 'group');
  const inherited = stage?.periods ?? data?.periods;
  const initial = data ? choiceFor(own !== undefined, own?.periods, inherited) : null;
  const draft = useDraft(groupId, initial);
  return {
    ...draft,
    status: query.isPending && groupId ? 'loading' as const : query.isError ? 'error' as const : 'ready' as const,
    inheritLabel: stage ? '조별리그 설정 따르기' : '대회 기본값 따르기',
    inheritedSummary: describePeriods(inherited),
    pending: update.isPending,
    save: async () => {
      if (!data?.expectedVersion || !groupId || !draft.payload) return false;
      await update.mutateAsync({ expectedVersion: data.expectedVersion, groupId, ...draft.payload });
      return true;
    },
  };
}

/**
 * 수정 창 안의 "경기 방식" 칸. 리그 경기 장소의 "기본 장소 사용 / 이 경기만 다른 장소"와 같은 모양이다.
 * 위 설정 값을 보여 주기만 하고, 저장은 부모 창의 저장 버튼이 이 조·경기에만 한다.
 */
export function PeriodOverrideField({
  inheritLabel = '위 설정 따르기',
  inheritedSummary,
  customLabel,
  customHint,
  status,
  choice,
  onChange,
  disabled = false,
  lockedReason = null,
}: {
  inheritLabel?: string;
  inheritedSummary: string;
  customLabel: string;
  customHint: string;
  status: 'loading' | 'error' | 'ready';
  choice: PeriodOverrideChoice | null;
  onChange: (choice: PeriodOverrideChoice) => void;
  disabled?: boolean;
  lockedReason?: string | null;
}) {
  const name = useId();
  const inputId = useId();
  const legend = <legend className="mb-1 text-[length:var(--font-size-body-sm)] font-medium text-[var(--text-strong)]">경기 방식</legend>;
  if (status !== 'ready' || choice === null) {
    return (
      <fieldset className="m-0 grid min-w-0 gap-1 border-0 p-0">
        {legend}
        <p className={`m-0 text-[length:var(--font-size-caption)] ${status === 'error' ? 'text-[var(--red700)]' : 'text-[var(--text-muted)]'}`} role={status === 'error' ? 'alert' : undefined}>
          {status === 'error' ? '경기 방식을 불러오지 못했어요. 다른 항목은 그대로 저장할 수 있어요.' : '경기 방식을 불러오는 중이에요.'}
        </p>
      </fieldset>
    );
  }
  const names = periodLabels(choice.minutes.length);
  const options = [
    { mode: 'inherit' as const, label: inheritLabel, detail: inheritedSummary },
    { mode: 'custom' as const, label: customLabel, detail: null },
  ];
  return (
    <fieldset className="m-0 grid min-w-0 gap-2 border-0 p-0" disabled={disabled || lockedReason !== null}>
      {legend}
      {options.map((option) => (
        <label
          key={option.mode}
          className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-xl border border-[var(--border)] px-3 py-2 text-[length:var(--font-size-body-sm)] text-[var(--text-body)] has-[:checked]:border-[var(--blue500)] has-[:checked]:text-[var(--text-strong)] has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60"
        >
          <input
            type="radio"
            name={name}
            checked={choice.mode === option.mode}
            onChange={() => onChange({ ...choice, mode: option.mode })}
            className="h-5 w-5 shrink-0 accent-[var(--blue500)]"
          />
          <span className="min-w-0">
            {option.label}
            {option.detail ? <span className="block text-[length:var(--font-size-caption)] text-[var(--text-muted)]">{option.detail}</span> : null}
          </span>
        </label>
      ))}
      {choice.mode === 'custom' && lockedReason === null ? (
        <>
          <div className="flex gap-2" role="group" aria-label="단판 또는 전·후반">
            {([{ count: 2, label: '전·후반' }, { count: 1, label: '단판' }] as const).map((option) => (
              <button
                key={option.count}
                type="button"
                aria-pressed={choice.minutes.length === option.count}
                onClick={() => { if (choice.minutes.length !== option.count) onChange({ ...choice, minutes: switchPeriodCount(choice.minutes, option.count) }); }}
                className="min-h-[44px] flex-1 rounded-xl border border-[var(--border)] bg-[var(--card-surface)] px-3 text-[length:var(--font-size-body-sm)] font-semibold text-[var(--text-body)] transition-colors aria-pressed:border-blue-500 aria-pressed:bg-blue-500 aria-pressed:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className={`grid gap-2 ${choice.minutes.length === 2 ? 'grid-cols-2' : ''}`}>
            {choice.minutes.map((value, index) => (
              <div key={index} className="grid gap-1">
                <label htmlFor={`${inputId}-${index}`} className="text-[length:var(--font-size-caption)] font-medium text-[var(--text-muted)]">{names[index]} (분)</label>
                <input
                  id={`${inputId}-${index}`}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={240}
                  value={value}
                  onChange={(event) => onChange({ ...choice, minutes: choice.minutes.map((item, at) => at === index ? event.target.value : item) })}
                  className="h-[44px] w-full rounded-xl border border-[var(--border-strong)] bg-[var(--card-surface)] px-3 text-[length:var(--font-size-body-sm)] text-[var(--text-strong)] focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
            ))}
          </div>
          <p className="m-0 text-[length:var(--font-size-caption)] text-[var(--text-muted)]">{customHint}</p>
        </>
      ) : null}
      {lockedReason ? <p className="m-0 text-[length:var(--font-size-caption)] text-[var(--text-muted)]">{lockedReason}</p> : null}
    </fieldset>
  );
}
