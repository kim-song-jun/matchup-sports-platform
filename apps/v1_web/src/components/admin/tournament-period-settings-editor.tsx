'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, RotateCcw, Save, Trash2 } from 'lucide-react';
import { extractErrorCode, extractErrorMessage } from '@/lib/error-message';
import {
  useTournamentPeriodSettings,
  useUpdateTournamentPeriodSettings,
  type TournamentPeriodPhase,
  type TournamentPeriodSettingsResponse,
} from '@/hooks/use-tournament-period-settings';

interface TournamentPeriodSettingsEditorProps {
  tournamentId: string;
  canWrite: boolean;
  showToast: (message: string, variant?: 'success' | 'error') => void;
}

function draftFromSettings(settings: TournamentPeriodSettingsResponse | undefined): string[] {
  if (settings?.periods) return settings.periods.map((period) => String(period.durationMinutes));
  if (settings?.legacyPeriodCount) return Array.from({ length: settings.legacyPeriodCount }, () => '');
  return [];
}

function periodFieldLabel(index: number, count: number): string {
  return count === 1 ? '단판' : count === 2 ? (index === 0 ? '전반' : '후반') : `피리어드 ${index + 1}`;
}

function hasValidDurations(durations: string[]) {
  return durations.every((duration) => /^\d+$/.test(duration.trim()) && Number(duration) >= 1);
}

function switchPeriodCount(durations: readonly string[], count: 1 | 2): string[] {
  if (count === 1) return [durations.length === 1 ? durations[0] : String(durations.reduce((sum, value) => sum + (Number(value) || 0), 0))];
  if (durations.length === 2) return [...durations];
  const total = Number(durations[0]) || 0;
  return [String(Math.ceil(total / 2)), String(Math.floor(total / 2))];
}

const PERIOD_PHASES: ReadonlyArray<{ value: TournamentPeriodPhase; label: string }> = [
  { value: 'group', label: '조별리그' },
  { value: 'round64', label: '64강' },
  { value: 'round32', label: '32강' },
  { value: 'round16', label: '16강' },
  { value: 'round12', label: '12강' },
  { value: 'quarter', label: '8강' },
  { value: 'semi', label: '4강' },
  { value: 'final', label: '결승' },
  { value: 'third_place', label: '3·4위전' },
];

function phaseLabel(phase: TournamentPeriodPhase) {
  return PERIOD_PHASES.find((option) => option.value === phase)?.label ?? phase;
}

export function TournamentPeriodSettingsEditor(props: TournamentPeriodSettingsEditorProps) {
  return <PeriodSettingsEditor key={props.tournamentId} {...props} />;
}

function PeriodSettingsEditor({
  tournamentId,
  canWrite,
  showToast,
}: TournamentPeriodSettingsEditorProps) {
  const settingsQuery = useTournamentPeriodSettings(tournamentId);
  const updateSettings = useUpdateTournamentPeriodSettings(tournamentId);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string[]>([]);
  const [editingExpectedVersion, setEditingExpectedVersion] = useState<string | null>(null);
  // 편집을 시작할 때 본 피리어드. 버전 충돌이 나도 서버 피리어드가 이것과 같으면 다른 설정(기본 장소·대표 이미지 등)이 행을 바꾼 것뿐이다.
  const [editingBasePeriods, setEditingBasePeriods] = useState<string | null>(null);
  const [stageEditingPhase, setStageEditingPhase] = useState<TournamentPeriodPhase | null>(null);
  const [stageDraft, setStageDraft] = useState<string[]>([]);
  const [newPhase, setNewPhase] = useState<TournamentPeriodPhase>('group');
  const hydratedSettingsKey = useRef<string | null>(null);
  const settingsDataKey = useMemo(() => JSON.stringify(settingsQuery.data ?? null), [settingsQuery.data]);
  const availableStagePhases = useMemo(
    () => PERIOD_PHASES.filter((option) => !settingsQuery.data?.stageOverrides.some((override) => override.phase === option.value)),
    [settingsQuery.data?.stageOverrides],
  );

  useEffect(() => {
    if (!editing && settingsQuery.data && hydratedSettingsKey.current !== settingsDataKey) {
      hydratedSettingsKey.current = settingsDataKey;
      setDraft(draftFromSettings(settingsQuery.data));
    }
  }, [editing, settingsDataKey, settingsQuery.data]);

  useEffect(() => {
    if (availableStagePhases.some((option) => option.value === newPhase)) return;
    if (availableStagePhases[0]) setNewPhase(availableStagePhases[0].value);
  }, [availableStagePhases, newPhase]);

  const summary = useMemo(() => {
    if (settingsQuery.data?.requiresDurationInput) return '기존 설정에 각 피리어드 길이 입력 필요';
    if (!settingsQuery.data?.periods?.length) return '설정된 피리어드 없음';
    return `${settingsQuery.data.periods.length}개 · ${settingsQuery.data.periods.map((period) => `${period.durationMinutes}분`).join(' / ')}`;
  }, [settingsQuery.data]);

  const startEditing = () => {
    setDraft(draftFromSettings(settingsQuery.data));
    setEditingExpectedVersion(settingsQuery.data?.expectedVersion ?? null);
    setEditingBasePeriods(JSON.stringify(settingsQuery.data?.periods ?? null));
    setEditing(true);
  };

  const reloadServerValues = async () => {
    const result = await settingsQuery.refetch();
    if (result.isSuccess && result.data) {
      setDraft(draftFromSettings(result.data));
      setEditingExpectedVersion(result.data.expectedVersion ?? null);
      setEditing(false);
      showToast('최신 피리어드 설정을 불러왔어요.', 'success');
      return;
    }
    showToast('최신 피리어드 설정을 불러오지 못했어요. 입력 중인 값은 유지했어요.', 'error');
  };

  const save = () => {
    if (!canWrite) {
      showToast('현재 계정에는 피리어드 설정을 수정할 권한이 없어요.', 'error');
      return;
    }
    if (!editingExpectedVersion) {
      showToast('현재 설정 버전을 확인하지 못했어요. 다시 불러온 뒤 시도해 주세요.', 'error');
      return;
    }
    if (!draft.length || !hasValidDurations(draft)) {
      showToast('각 피리어드 시간을 1분 이상 입력해 주세요.', 'error');
      return;
    }

    const periods = draft.map((duration) => ({ durationMinutes: Number(duration) }));
    const submit = (expectedVersion: string, retryOnUnrelatedChange: boolean) =>
      updateSettings.mutate(
        { expectedVersion, periods },
        {
          onSuccess: (saved) => {
            setEditing(false);
            // 다른 규칙 버전에 남은 경기는 옮기지 않으므로, 실제로 옮긴 수만 말한다.
            const repointed = saved?.fixturesRepointed ?? 0;
            showToast(repointed > 0 ? `피리어드 설정을 저장했어요. 시작 전 경기 ${repointed}개에도 적용했어요.` : '피리어드 설정을 저장했어요.', 'success');
          },
          onError: async (error) => {
            if (extractErrorCode(error) === 'TOURNAMENT_VERSION_CONFLICT') {
              // 버전은 대회(리그) 행의 수정 시각이라 기본 장소·대표 이미지·공개 설정만 바꿔도 낡는다. 피리어드가 그대로면 새 버전으로 한 번 더 보낸다.
              if (retryOnUnrelatedChange) {
                const fresh = await settingsQuery.refetch();
                if (fresh.data?.expectedVersion && JSON.stringify(fresh.data.periods ?? null) === editingBasePeriods) {
                  setEditingExpectedVersion(fresh.data.expectedVersion);
                  submit(fresh.data.expectedVersion, false);
                  return;
                }
              }
              showToast('다른 곳에서 피리어드 설정이 먼저 바뀌었어요. 입력 중인 값은 유지했어요. 최신 설정을 불러오려면 다시 불러오기를 눌러 주세요.', 'error');
              return;
            }
            showToast(extractErrorMessage(error, '피리어드 설정 저장에 실패했어요.'), 'error');
          },
        },
      );
    submit(editingExpectedVersion, true);
  };

  const startStageEditing = (phase: TournamentPeriodPhase) => {
    const existing = settingsQuery.data?.stageOverrides.find((override) => override.phase === phase);
    setStageDraft(existing?.periods?.map((period) => String(period.durationMinutes)) ?? draftFromSettings(settingsQuery.data));
    setStageEditingPhase(phase);
  };

  const saveStage = (inheritDefault = false) => {
    if (!canWrite) {
      showToast('현재 계정에는 피리어드 설정을 수정할 권한이 없어요.', 'error');
      return;
    }
    if (!stageEditingPhase || !settingsQuery.data?.expectedVersion) return;
    if (!inheritDefault && (!stageDraft.length || !hasValidDurations(stageDraft))) {
      showToast('각 피리어드 시간을 1분 이상 입력해 주세요.', 'error');
      return;
    }
    updateSettings.mutate(
      {
        expectedVersion: settingsQuery.data.expectedVersion,
        phase: stageEditingPhase,
        inheritDefault,
        ...(inheritDefault ? {} : { periods: stageDraft.map((duration) => ({ durationMinutes: Number(duration) })) }),
      },
      {
        onSuccess: (saved) => {
          const repointed = saved.fixturesRepointed ?? 0;
          setStageEditingPhase(null);
          showToast(inheritDefault
            ? `${phaseLabel(stageEditingPhase)} 경기 시간을 기본값으로 되돌렸어요.${repointed > 0 ? ` 시작 전 경기 ${repointed}개에도 적용했어요.` : ''}`
            : `${phaseLabel(stageEditingPhase)} 경기 시간을 저장했어요.${repointed > 0 ? ` 시작 전 경기 ${repointed}개에도 적용했어요.` : ''}`, 'success');
        },
        onError: (error) => showToast(extractErrorMessage(error, '단계별 경기 시간 저장에 실패했어요.'), 'error'),
      },
    );
  };

  if (settingsQuery.isPending) {
    return <section aria-label="피리어드 설정" className="bg-[var(--card-surface)] rounded-2xl border border-[var(--border)] px-5 py-4 mb-6"><p className="text-[length:var(--font-size-body-sm)] text-[var(--text-muted)]">피리어드 설정을 불러오는 중이에요.</p></section>;
  }

  if (settingsQuery.isError || !settingsQuery.data) {
    return (
      <section aria-label="피리어드 설정" className="bg-[var(--card-surface)] rounded-2xl border border-[var(--border)] px-5 py-4 mb-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-[length:var(--font-size-label)] font-bold text-[var(--text-strong)]">피리어드 설정</h2>
            <p className="mt-1 text-[length:var(--font-size-body-sm)] text-[var(--text-muted)]">설정을 불러오지 못했어요. 서버 상태를 확인하고 다시 시도해 주세요.</p>
          </div>
          <button type="button" onClick={() => void settingsQuery.refetch()} className="tm-on-tint inline-flex items-center gap-2 h-[44px] px-3 rounded-lg text-[length:var(--font-size-caption)] font-medium text-[var(--text-muted)] bg-[var(--surface-soft)] hover:bg-[var(--grey300)]">
            <RotateCcw size={14} aria-hidden="true" /> 다시 시도
          </button>
        </div>
      </section>
    );
  }

  return (
    <section aria-label="피리어드 설정" className="bg-[var(--card-surface)] rounded-2xl border border-[var(--border)] px-5 py-4 mb-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[length:var(--font-size-label)] font-bold text-[var(--text-strong)]">피리어드 설정</h2>
          {!editing && <p className="mt-1 text-[length:var(--font-size-body-sm)] text-[var(--text-muted)]">{summary}</p>}
        </div>
        {canWrite && !editing && (
          <button type="button" onClick={startEditing} className="tm-on-tint inline-flex items-center gap-2 h-[44px] px-3 rounded-lg text-[length:var(--font-size-caption)] font-medium text-[var(--text-muted)] bg-[var(--surface-soft)] hover:bg-[var(--grey300)] focus-visible:outline-2 focus-visible:outline-blue-500">
            수정
          </button>
        )}
      </div>

      {!editing && settingsQuery.data.requiresDurationInput && (
        <p className="mt-3 text-[length:var(--font-size-body-sm)] text-amber-700">이전 설정에는 피리어드 수만 저장되어 있어요. 새 경기 생성 전에 각 길이를 입력해 주세요.</p>
      )}

      {editing && (
        <div className="mt-4 border-t border-[var(--border)] pt-4">
          <p className="text-[length:var(--font-size-body-sm)] text-[var(--text-muted)]">새로 만들 경기와 아직 시작하지 않은 경기에 적용돼요. 이미 시작했거나 끝난 경기는 그대로예요.</p>
          <div className="mt-3 flex flex-col gap-2">
            {draft.map((duration, index) => (
              <div key={`period-${index}`} className="flex items-center gap-2">
                <label htmlFor={`period-duration-${index}`} className="w-24 shrink-0 text-[length:var(--font-size-body-sm)] text-[var(--text-strong)]">{periodFieldLabel(index, draft.length)}</label>
                <div className="relative flex-1">
                  <input id={`period-duration-${index}`} inputMode="numeric" type="number" min={1} step={1} value={duration} onChange={(event) => setDraft((current) => current.map((value, valueIndex) => valueIndex === index ? event.target.value : value))} disabled={updateSettings.isPending || !canWrite} className="h-[44px] w-full rounded-xl border border-[var(--border)] bg-[var(--card-surface)] px-3 pr-10 text-[length:var(--font-size-body-sm)] text-[var(--text-strong)] focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50" />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[length:var(--font-size-caption)] text-[var(--text-muted)]">분</span>
                </div>
                {draft.length > 1 && <button type="button" aria-label={`피리어드 ${index + 1} 삭제`} onClick={() => setDraft((current) => current.filter((_, valueIndex) => valueIndex !== index))} disabled={updateSettings.isPending || !canWrite} className="inline-flex h-[44px] w-[44px] items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--surface-soft)] disabled:opacity-50"><Trash2 size={15} aria-hidden="true" /></button>}
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setDraft((current) => [...current, ''])} disabled={updateSettings.isPending || !canWrite} className="inline-flex h-[44px] items-center gap-1.5 rounded-lg px-3 text-[length:var(--font-size-body-sm)] font-medium text-[var(--text-muted)] hover:bg-[var(--surface-soft)] disabled:opacity-50"><Plus size={14} aria-hidden="true" /> 피리어드 추가</button>
            <span className="text-[length:var(--font-size-caption)] text-[var(--text-muted)]">총 {draft.length}개</span>
            <div className="ml-auto flex min-w-0 flex-wrap justify-end gap-2">
              <button type="button" onClick={() => { setEditing(false); setEditingExpectedVersion(null); setDraft(draftFromSettings(settingsQuery.data)); }} disabled={updateSettings.isPending} className="h-[44px] rounded-lg px-3 text-[length:var(--font-size-body-sm)] font-medium text-[var(--text-muted)] hover:bg-[var(--surface-soft)] disabled:opacity-50">취소</button>
              <button type="button" onClick={save} disabled={updateSettings.isPending || !canWrite} className="inline-flex h-[44px] items-center gap-1.5 rounded-lg bg-blue-600 px-3 text-[length:var(--font-size-body-sm)] font-semibold text-white hover:bg-blue-700 disabled:opacity-50"><Save size={14} aria-hidden="true" /> 저장</button>
              {extractErrorCode(updateSettings.error) === 'TOURNAMENT_VERSION_CONFLICT' && <button type="button" onClick={() => void reloadServerValues()} disabled={settingsQuery.isFetching} className="h-[44px] rounded-lg px-3 text-[length:var(--font-size-body-sm)] font-medium text-[var(--text-muted)] hover:bg-[var(--surface-soft)] disabled:opacity-50">최신 설정 다시 불러오기</button>}
            </div>
          </div>
        </div>
      )}

      {!editing && settingsQuery.data.kind === 'regular_tournament' && (
        <div className="mt-5 border-t border-[var(--border)] pt-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-[length:var(--font-size-body-sm)] font-semibold text-[var(--text-strong)]">단계별 경기 시간</h3>
              <p className="mt-1 text-[length:var(--font-size-caption)] text-[var(--text-muted)]">설정하지 않은 단계는 위 기본값을 사용해요.</p>
            </div>
            {canWrite && stageEditingPhase === null && (
              <div className="flex flex-wrap items-center gap-2">
                <label htmlFor="new-period-phase" className="sr-only">추가할 대회 단계</label>
                <select id="new-period-phase" value={newPhase} onChange={(event) => setNewPhase(event.target.value as TournamentPeriodPhase)} className="h-[44px] rounded-lg border border-[var(--border)] bg-[var(--card-surface)] px-3 text-[length:var(--font-size-body-sm)] text-[var(--text-strong)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500">
                  {availableStagePhases.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
                <button type="button" onClick={() => startStageEditing(newPhase)} disabled={settingsQuery.data.stageOverrides.length === PERIOD_PHASES.length} className="inline-flex h-[44px] items-center gap-1.5 rounded-lg px-3 text-[length:var(--font-size-body-sm)] font-medium text-blue-600 hover:bg-[var(--surface-soft)] disabled:opacity-50"><Plus size={14} aria-hidden="true" /> 단계 추가</button>
              </div>
            )}
          </div>

          <div className="mt-3 grid gap-2">
            {settingsQuery.data.stageOverrides.map((override) => (
              <div key={override.phase} className="flex min-h-[52px] items-center justify-between gap-3 rounded-xl bg-[var(--surface-soft)] px-3 py-2">
                <div>
                  <p className="text-[length:var(--font-size-body-sm)] font-semibold text-[var(--text-strong)]">{phaseLabel(override.phase)}</p>
                  <p className="text-[length:var(--font-size-caption)] text-[var(--text-muted)]">{override.periods?.map((period) => `${period.durationMinutes}분`).join(' / ') ?? '시간 입력 필요'}</p>
                </div>
                {canWrite && <button type="button" onClick={() => startStageEditing(override.phase)} disabled={stageEditingPhase !== null || updateSettings.isPending} className="h-[44px] rounded-lg px-3 text-[length:var(--font-size-caption)] font-medium text-[var(--text-muted)] hover:bg-[var(--grey300)] disabled:opacity-50">수정</button>}
              </div>
            ))}
            {settingsQuery.data.stageOverrides.length === 0 && stageEditingPhase === null && <p className="text-[length:var(--font-size-caption)] text-[var(--text-muted)]">모든 단계가 대회 기본값을 사용하고 있어요.</p>}
          </div>

          {stageEditingPhase !== null && (
            <div className="mt-4 rounded-xl border border-[var(--border)] p-3">
              <p className="text-[length:var(--font-size-body-sm)] font-semibold text-[var(--text-strong)]">{phaseLabel(stageEditingPhase)} 설정</p>
              <p className="mt-1 text-[length:var(--font-size-caption)] text-[var(--text-muted)]">이 단계의 새 경기와 아직 시작하지 않은 경기에만 적용돼요.</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {stageDraft.map((duration, index) => (
                  <label key={`${stageEditingPhase}-${index}`} className="grid gap-1 text-[length:var(--font-size-caption)] font-medium text-[var(--text-muted)]">
                    {periodFieldLabel(index, stageDraft.length)} (분)
                    <input type="number" inputMode="numeric" min={1} value={duration} disabled={updateSettings.isPending || !canWrite} onChange={(event) => setStageDraft((current) => current.map((value, valueIndex) => valueIndex === index ? event.target.value : value))} className="h-[44px] rounded-xl border border-[var(--border)] bg-[var(--card-surface)] px-3 text-[length:var(--font-size-body-sm)] text-[var(--text-strong)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:opacity-50" />
                  </label>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={() => setStageDraft((current) => current.length === 1 ? switchPeriodCount(current, 2) : switchPeriodCount(current, 1))} disabled={updateSettings.isPending || !canWrite} className="h-[44px] rounded-lg px-3 text-[length:var(--font-size-body-sm)] text-[var(--text-muted)] hover:bg-[var(--surface-soft)] disabled:opacity-50">{stageDraft.length === 1 ? '전·후반으로' : '단판으로'}</button>
                <div className="ml-auto flex flex-wrap justify-end gap-2">
                  {settingsQuery.data.stageOverrides.some((override) => override.phase === stageEditingPhase) && <button type="button" onClick={() => saveStage(true)} disabled={updateSettings.isPending || !canWrite} className="h-[44px] rounded-lg px-3 text-[length:var(--font-size-body-sm)] font-medium text-red-600 hover:bg-red-50 disabled:opacity-50">기본값 사용</button>}
                  <button type="button" onClick={() => setStageEditingPhase(null)} disabled={updateSettings.isPending} className="h-[44px] rounded-lg px-3 text-[length:var(--font-size-body-sm)] text-[var(--text-muted)] hover:bg-[var(--surface-soft)]">취소</button>
                  <button type="button" onClick={() => saveStage(false)} disabled={updateSettings.isPending || !canWrite} className="h-[44px] rounded-lg bg-blue-600 px-3 text-[length:var(--font-size-body-sm)] font-semibold text-white hover:bg-blue-700 disabled:opacity-50">저장</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
