'use client';
import { useEffect, useState } from 'react';
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
  const [baseline, setBaseline] = useState(() => ({ revision: view.revision, serialized: JSON.stringify(view.config) }));
  const { confirm, ConfirmModal } = useConfirm();
  const dirty = JSON.stringify(plan) !== baseline.serialized || Boolean(reason.trim());
  const serverChanged = view.revision !== baseline.revision || JSON.stringify(view.config) !== baseline.serialized;
  const conflicted = dirty && serverChanged;
  useEffect(() => {
    if (!dirty && serverChanged) {
      setPlan(view.config);
      setBaseline({ revision: view.revision, serialized: JSON.stringify(view.config) });
    }
  }, [dirty, serverChanged, view.config, view.revision]);
  async function reload() {
    if (!await confirm({ title: '구성 입력을 다시 불러올까요?', message: '현재 작성 중인 구성과 변경 사유를 최신 저장값으로 바꿔요.', confirmLabel: '다시 불러오기' })) return;
    const result = await api.view.refetch();
    if (result.isError || !result.data) { setError(extractErrorMessage(result.error, '최신 구성을 불러오지 못했어요. 입력은 유지돼요.')); return; }
    setPlan(result.data.config); setReason(''); setError('');
    setBaseline({ revision: result.data.revision, serialized: JSON.stringify(result.data.config) });
  }
  async function save() {
    if (conflicted || api.view.isError) { setError('저장된 구성이 바뀌었어요. 현재 입력을 확인한 뒤 최신 구성을 다시 불러와 주세요.'); return; }
    if (stagePlanError(plan) || !reason.trim() || !await confirm({ title: '시작 전 편성을 수정할까요?', message: '방식·정원을 바꾼 편성은 기존 시작 전 경기를 보관하고 새 대진을 만들어요. 해당 편성의 팀·일정·경기별 설정은 다시 입력해야 해요. 수정하지 않은 편성의 경기 ID와 기록은 유지해요. 시작한 편성과 연결된 변경은 거절해요.', confirmLabel: '구성 변경 저장' })) return;
    try {
      setError('');
      const saved = await api.structure.mutateAsync({ expectedRevision: baseline.revision, plan, reason });
      setPlan(saved.config); setReason('');
      setBaseline({ revision: saved.revision, serialized: JSON.stringify(saved.config) });
    } catch (cause) { setError(extractErrorMessage(cause, '대회 구성을 변경하지 못했어요.')); }
  }
  const counts = stagePlanCounts(plan);
  return <details className="space-y-3"><summary className="min-h-11 cursor-pointer py-3 tm-text-label">단계·편성 구성 수정</summary>
    <StagePlanEditor value={plan} onChange={setPlan} disabled={api.structure.isPending} />
    <p className="tm-text-caption">모집 정원은 {stagePlanCounts(view.config).teams}팀으로 유지해 주세요. 현재 구성: {counts.teams}팀 · {counts.fixtures}경기</p>
    <label className="block tm-text-label">구성 변경 사유<textarea className={stageControl} value={reason} maxLength={500} onChange={event => setReason(event.target.value)} /></label>
    {error && <AlertBanner tone="error" message={error} />}
    {conflicted && <AlertBanner tone="warning" message="다른 작업으로 저장된 구성이 바뀌었어요. 작성 중인 구성과 사유는 보존했으며, 최신 내용을 다시 불러오기 전에는 저장할 수 없어요." />}
    <div className="flex flex-wrap gap-2">
      <Button variant="neutral" disabled={api.structure.isPending || api.view.isError || conflicted || !reason.trim() || Boolean(stagePlanError(plan))} onClick={() => void save()}>구성 변경 저장</Button>
      <Button variant="neutral" disabled={api.structure.isPending || api.view.isFetching} onClick={() => void reload()}>저장된 구성 다시 불러오기</Button>
    </div>{ConfirmModal}
  </details>;
}
