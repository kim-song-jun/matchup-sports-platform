'use client';
import { useState } from 'react';
import { useTournamentPeriodSettings, useUpdateTournamentPeriodSettings } from '@/hooks/use-tournament-period-settings';
import { Button } from '@/components/v1-ui/button';
import { AlertBanner, ErrorState, SectionTitle } from '@/components/v1-ui/primitives';
import { extractErrorMessage } from '@/lib/error-message';
import type { StagePlan } from '@/types/stage-plan';
import { stageControl } from './stage-plan-editor';

export function StagePeriodSettings({ tournamentId, plan, canWrite }: { tournamentId: string; plan: StagePlan; canWrite: boolean }) {
  const query = useTournamentPeriodSettings(tournamentId), mutation = useUpdateTournamentPeriodSettings(tournamentId);
  const [scope, setScope] = useState(`stage:${plan.stages[0].key}`), [draft, setDraft] = useState(''), [error, setError] = useState('');
  const settings = query.data, [kind, key] = scope.split(':');
  const override = settings?.compositionOverrides?.find(item => item.scope === kind && item.key === key);
  const inheritedStage = kind === 'pool' ? plan.stages.find(stage => stage.pools.some(pool => pool.key === key)) : undefined;
  const inherited = inheritedStage ? settings?.compositionOverrides?.find(item => item.scope === 'stage' && item.key === inheritedStage.key)?.periods : undefined;
  const periods = override?.periods ?? inherited ?? settings?.periods;
  async function save(inheritDefault: boolean) {
    if (!settings?.expectedVersion) return;
    const durations = draft.split('/').map(value => Number(value.trim()));
    if (!inheritDefault && (!draft.trim() || durations.some(value => !Number.isInteger(value) || value < 1 || value > 120) || durations.length > 10)) { setError('피리어드마다 1~120분을 입력하고 /로 구분해 주세요.'); return; }
    try {
      setError('');
      await mutation.mutateAsync({ expectedVersion: settings.expectedVersion, ...(kind === 'stage' ? { stageKey: key } : { poolKey: key }), inheritDefault, ...(!inheritDefault ? { periods: durations.map(durationMinutes => ({ durationMinutes })) } : {}) });
      setDraft('');
    } catch (cause) { setError(extractErrorMessage(cause, '경기 시간을 저장하지 못했어요.')); }
  }
  return <section className="space-y-3">
    <SectionTitle title="단계·편성별 경기 시간" />
    <p className="tm-text-caption">경기 → 조 → 편성 → 단계 → 대회 순서로 적용해요. 시작한 경기와 별도 규칙에 고정된 경기는 유지해요.</p>
    {query.isError ? <ErrorState message="경기 시간을 불러오지 못했어요." onRetry={() => void query.refetch()} /> : <>
      <label className="block tm-text-label">적용 범위<select className={stageControl} value={scope} onChange={event => { setScope(event.target.value); setDraft(''); }}>{plan.stages.map(stage => <optgroup key={stage.key} label={stage.name}><option value={`stage:${stage.key}`}>{stage.name} 전체</option>{stage.pools.map(pool => <option key={pool.key} value={`pool:${pool.key}`}>{pool.name}</option>)}</optgroup>)}</select></label>
      <p className="tm-text-label">{override ? '별도 설정' : '위 설정 따름'} · {periods?.map(period => `${period.durationMinutes}분`).join(' / ') ?? '기본 경기 시간 입력 필요'}</p>
      {canWrite && <div className="flex flex-wrap items-end gap-2"><label className="flex-1 tm-text-label">피리어드 시간 · 분<input className={stageControl} value={draft} placeholder="예: 15 / 15" onChange={event => setDraft(event.target.value)} disabled={mutation.isPending || !settings} /></label><Button variant="neutral" onClick={() => void save(false)} disabled={mutation.isPending || !draft || !settings}>경기 시간 저장</Button><Button variant="neutral" onClick={() => void save(true)} disabled={mutation.isPending || !override}>위 설정 따르기</Button></div>}
    </>}
    {error && <AlertBanner tone="error" message={error} />}
  </section>;
}
