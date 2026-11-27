'use client';
import { useState } from 'react';
import { useTournamentPeriodSettings, useUpdateTournamentPeriodSettings } from '@/hooks/use-tournament-period-settings';
import { Button } from '@/components/v1-ui/button';
import { AlertBanner, ErrorState, SectionTitle } from '@/components/v1-ui/primitives';
import { useConfirm } from '@/components/v1-ui/confirm-modal';
import { extractErrorCode, extractErrorMessage } from '@/lib/error-message';
import { hasValidPeriodDurations } from '@/lib/tournament-periods';
import type { StagePlan } from '@/types/stage-plan';
import { stageControl } from './stage-plan-editor';

type Props = { tournamentId: string; plan: StagePlan; canWrite: boolean };
export function StagePeriodSettings(props: Props) {
  return <StagePeriodSettingsForm key={props.tournamentId} {...props} />;
}

function StagePeriodSettingsForm({ tournamentId, plan, canWrite }: Props) {
  const query = useTournamentPeriodSettings(tournamentId), mutation = useUpdateTournamentPeriodSettings(tournamentId);
  const [scope, setScope] = useState(`stage:${plan.stages[0].key}`), [draft, setDraft] = useState(''), [error, setError] = useState('');
  const [baseline, setBaseline] = useState<{ scope: string; version: string } | null>(null);
  const [saveConflict, setSaveConflict] = useState(false);
  const { confirm, ConfirmModal } = useConfirm();
  const scopes = plan.stages.flatMap(stage => [`stage:${stage.key}`, ...stage.pools.map(pool => `pool:${pool.key}`)]);
  const activeScope = scopes.includes(scope) ? scope : `stage:${plan.stages[0].key}`;
  const settings = query.data, [kind, key] = activeScope.split(':');
  const override = settings?.compositionOverrides?.find(item => item.scope === kind && item.key === key);
  const inheritedStage = kind === 'pool' ? plan.stages.find(stage => stage.pools.some(pool => pool.key === key)) : undefined;
  const inherited = inheritedStage ? settings?.compositionOverrides?.find(item => item.scope === 'stage' && item.key === inheritedStage.key)?.periods : undefined;
  const periods = override?.periods ?? inherited ?? settings?.periods;
  const conflicted = saveConflict || Boolean(baseline && (baseline.scope !== activeScope || baseline.version !== settings?.expectedVersion));
  function edit(value: string) {
    if (!baseline && settings?.expectedVersion) setBaseline({ scope: activeScope, version: settings.expectedVersion });
    setDraft(value);
  }
  async function reload() {
    if (mutation.isPending || query.isFetching) return;
    if ((draft || conflicted) && !await confirm({ title: '경기 시간을 다시 불러올까요?', message: '작성 중인 경기 시간을 최신 저장값으로 바꿔요.', confirmLabel: '다시 불러오기' })) return;
    const result = await query.refetch();
    if (result.isError || !result.data) { setError(extractErrorMessage(result.error, '최신 경기 시간을 불러오지 못했어요. 입력은 유지돼요.')); return; }
    setDraft(''); setBaseline(null); setSaveConflict(false); setError('');
  }
  async function changeScope(next: string) {
    if (mutation.isPending || query.isFetching) return;
    if (draft && !await confirm({ title: '적용 범위를 바꿀까요?', message: '현재 범위에서 작성 중인 경기 시간은 저장되지 않아요.', confirmLabel: '범위 바꾸기' })) return;
    setScope(next); setDraft(''); setBaseline(null); setSaveConflict(false); setError('');
  }
  async function save(inheritDefault: boolean) {
    if (!canWrite || mutation.isPending || !settings?.expectedVersion || query.isError || query.isFetching || conflicted) return;
    const durations = draft.split('/');
    if (!inheritDefault && !hasValidPeriodDurations(durations)) { setError('경기 시간마다 1분 이상 정수를 입력하고 /로 구분해 주세요.'); return; }
    try {
      setError('');
      await mutation.mutateAsync({ expectedVersion: baseline?.version ?? settings.expectedVersion, ...(kind === 'stage' ? { stageKey: key } : { poolKey: key }), inheritDefault, ...(!inheritDefault ? { periods: durations.map(value => ({ durationMinutes: Number(value.trim()) })) } : {}) });
      setDraft(''); setBaseline(null); setSaveConflict(false);
    } catch (cause) {
      if (extractErrorCode(cause) === 'TOURNAMENT_VERSION_CONFLICT') setSaveConflict(true);
      setError(extractErrorMessage(cause, '경기 시간을 저장하지 못했어요.'));
    }
  }
  return <section className="space-y-3">
    <SectionTitle title="단계·편성별 경기 시간" />
    <p className="tm-text-caption">경기 → 조 → 편성 → 단계 → 대회 순서로 적용해요. 시작한 경기와 별도 규칙에 고정된 경기는 유지해요.</p>
    {query.isError ? <ErrorState message="경기 시간을 불러오지 못했어요." onRetry={() => void query.refetch()} /> : <>
      <label className="block tm-text-label">적용 범위<select className={stageControl} value={activeScope} disabled={mutation.isPending || query.isFetching} onChange={event => void changeScope(event.target.value)}>{plan.stages.map(stage => <optgroup key={stage.key} label={stage.name}><option value={`stage:${stage.key}`}>{stage.name} 전체</option>{stage.pools.map(pool => <option key={pool.key} value={`pool:${pool.key}`}>{pool.name}</option>)}</optgroup>)}</select></label>
      <p className="tm-text-label">{override ? '별도 설정' : '위 설정 따름'} · {periods?.map(period => `${period.durationMinutes}분`).join(' / ') ?? '기본 경기 시간 입력 필요'}</p>
      {canWrite && <div className="flex flex-wrap items-end gap-2"><label className="flex-1 tm-text-label">경기 시간 · 분<input className={stageControl} value={draft} placeholder="예: 15 / 15" onChange={event => edit(event.target.value)} disabled={mutation.isPending || !settings || query.isFetching} /></label><Button variant="neutral" onClick={() => void save(false)} disabled={mutation.isPending || query.isFetching || conflicted || !draft || !settings}>경기 시간 저장</Button><Button variant="neutral" onClick={() => void save(true)} disabled={mutation.isPending || query.isFetching || conflicted || !override}>위 설정 따르기</Button></div>}
    </>}
    {conflicted && <AlertBanner tone="warning" message="저장된 설정이 바뀌었어요. 작성 중인 경기 시간은 보존했으며, 최신 설정을 다시 불러오기 전에는 저장할 수 없어요." />}
    {canWrite && <Button variant="neutral" disabled={mutation.isPending || query.isFetching} onClick={() => void reload()}>최신 경기 시간 다시 불러오기</Button>}
    {error && <AlertBanner tone="error" message={error} />}
    {ConfirmModal}
  </section>;
}
