'use client';
import { useState } from 'react';
import { useStagePlan } from '@/hooks/use-stage-plan';
import type { StagePlanView, StagePoolView } from '@/types/stage-plan';
import { AlertBanner, SectionTitle } from '@/components/v1-ui/primitives';
import { Button } from '@/components/v1-ui/button';
import { extractErrorMessage } from '@/lib/error-message';
import { stageControl } from './stage-plan-editor';
import { formatSixTeamDirectFinalRule } from '@/lib/tournament-tie-break';
export function StageSixTeamControl({ tournamentId, view, pool, canWrite }: { tournamentId: string; view: StagePlanView; pool: StagePoolView; canWrite: boolean }) {
  const api = useStagePlan(tournamentId), [bye, setBye] = useState(pool.sixTeam?.manual ? pool.sixTeam.bye ?? '' : ''), [reason, setReason] = useState(''), [error, setError] = useState('');
  const state = pool.sixTeam;
  if (!state) return null;
  const name = (id: string | null) => view.registrations.find(row => row.id === id)?.team.name ?? '결정 대기';
  async function save() {
    if (!state) return;
    try { setError(''); await api.sixTeam.mutateAsync({ expectedRevision: view.revision, poolKey: pool.key, sourceVersion: state.sourceVersion, byeRegistrationId: bye || null, reason }); } catch (cause) { setError(extractErrorMessage(cause, '결승 직행을 저장하지 못했어요.')); }
  }
  return <section className="space-y-3"><SectionTitle title="6강 결승 직행" /><p className="tm-text-label">결승 직행: {name(state.bye)} · {state.manual ? '운영자 결정' : '공식 경기 성적 비교'}</p>
    {state.needsReview && <AlertBanner tone="warning" message="6강 결과가 바뀌었어요. 결승 직행과 후속 참가팀을 다시 확인해 주세요." />}
    <p className="tm-text-caption">{formatSixTeamDirectFinalRule(pool.sixTeamDirectFinalOrder)} 동률이면 사유와 함께 직접 결정해요.</p>
    {canWrite && <><label className="block tm-text-label">결승 직행팀<select className={stageControl} value={bye} disabled={!state.ready || api.sixTeam.isPending} onChange={event => setBye(event.target.value)}><option value="">공식 비교 자동 결정 · 동률은 대기</option>{state.candidates.map(id => <option key={id} value={id}>{name(id)}</option>)}</select></label><label className="block tm-text-label">결승 직행 결정 사유<textarea className={stageControl} value={reason} maxLength={500} disabled={!state.ready || api.sixTeam.isPending} onChange={event => setReason(event.target.value)} /></label><Button variant="neutral" disabled={!state.ready || !reason.trim() || api.sixTeam.isPending} onClick={() => void save()}>결승 직행 저장</Button></>}
    {error && <AlertBanner tone="error" message={error} />}
  </section>;
}
