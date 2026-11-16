'use client';
import { useState } from 'react';
import { StagePlanEditor, stageControl } from './stage-plan-editor';
import { useStagePlan } from '@/hooks/use-stage-plan';
import { stagePlanCounts, stagePlanError } from '@/lib/stage-plan';
import type { StagePlanView } from '@/types/stage-plan';
import { Button } from '@/components/v1-ui/button';
import { AlertBanner } from '@/components/v1-ui/primitives';
import { useConfirm } from '@/components/v1-ui/confirm-modal';
import { extractErrorMessage } from '@/lib/error-message';

export function StageStructureEditor({ tournamentId, view }: { tournamentId: string; view: StagePlanView }) {
  const api = useStagePlan(tournamentId), [plan, setPlan] = useState(view.config), [reason, setReason] = useState(''), [error, setError] = useState('');
  const { confirm, ConfirmModal } = useConfirm();
  async function save() {
    if (stagePlanError(plan) || !reason.trim() || !await confirm({ title: '시작 전 편성을 수정할까요?', message: '방식·정원을 바꾼 편성은 기존 시작 전 경기를 보관하고 새 대진을 만들어요. 해당 편성의 팀·일정·경기별 설정은 다시 입력해야 해요. 수정하지 않은 편성의 경기 ID와 기록은 유지해요. 시작한 편성과 연결된 변경은 거절해요.', confirmLabel: '구성 변경 저장' })) return;
    try { setError(''); await api.structure.mutateAsync({ expectedRevision: view.revision, plan, reason }); } catch (cause) { setError(extractErrorMessage(cause, '대회 구성을 변경하지 못했어요.')); }
  }
  const counts = stagePlanCounts(plan);
  return <details className="space-y-3"><summary className="min-h-11 cursor-pointer py-3 tm-text-label">단계·편성 구성 수정</summary>
    <StagePlanEditor value={plan} onChange={setPlan} disabled={api.structure.isPending} />
    <p className="tm-text-caption">모집 정원은 {stagePlanCounts(view.config).teams}팀으로 유지해 주세요. 현재 구성: {counts.teams}팀 · {counts.fixtures}경기</p>
    <label className="block tm-text-label">구성 변경 사유<textarea className={stageControl} value={reason} maxLength={500} onChange={event => setReason(event.target.value)} /></label>
    {error && <AlertBanner tone="error" message={error} />}
    <Button variant="neutral" disabled={api.structure.isPending || !reason.trim() || Boolean(stagePlanError(plan))} onClick={() => void save()}>구성 변경 저장</Button>{ConfirmModal}
  </details>;
}
