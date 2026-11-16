'use client';
import { useState } from 'react';
import { useStagePlan } from '@/hooks/use-stage-plan';
import type { StagePlanView, StagePoolView } from '@/types/stage-plan';
import type { V1AdminBracketFixture } from '@/types/api';
import { Button } from '@/components/v1-ui/button';
import { AlertBanner } from '@/components/v1-ui/primitives';
import { useConfirm } from '@/components/v1-ui/confirm-modal';
import { extractErrorMessage } from '@/lib/error-message';
import { stageControl } from './stage-plan-editor';
export function StageFixtureRepair({ tournamentId, view, pool, fixtures }: { tournamentId: string; view: StagePlanView; pool: StagePoolView; fixtures: V1AdminBracketFixture[] }) {
  const api = useStagePlan(tournamentId), [selection, setSelection] = useState(''), [reason, setReason] = useState(''), [error, setError] = useState('');
  const { confirm, ConfirmModal } = useConfirm();
  const choices = fixtures.filter(fixture => pool.fixtureIds.includes(fixture.id)).flatMap(fixture => {
    const replay = fixture.status === 'cancelled' || fixture.game?.state === 'CANCELLED' || fixture.game?.latestRevision?.state === 'VOID';
    const removable = fixture.game?.state === 'SCHEDULED' && !fixture.game.hasLiveRecords && !fixture.game.hasOfficialResult && !fixture.game.latestRevision;
    return replay || removable ? [{ value: `${replay ? 'replay' : 'remove'}:${fixture.id}`, label: `${fixture.fixtureNumber}경기 · ${fixture.homeTeamName} vs ${fixture.awayTeamName} · ${replay ? '재경기 만들기' : '미시작 경기 삭제'}` }] : [];
  });
  (pool.removedFixtures ?? []).forEach(fixture => choices.push({ value: `restore:${fixture.id}`, label: `${fixture.fixtureNumber}경기 · ${fixture.round} · 삭제한 경기 복원` }));
  async function save() {
    if (!selection || !reason.trim() || !await confirm({ title: '경기 구성을 변경할까요?', message: '삭제·재경기 대상의 이전 기록은 보관해요. 복원·재경기는 새 경기 ID로 만들고 팀 자리와 연결을 복원해요. 해당 경기의 일정·장소·시간 재정의는 다시 확인해 주세요. 다른 경기 ID와 일정은 유지해요. 누락된 경기가 있으면 다음 단계로 자동 진출하지 않아요.', confirmLabel: '경기 변경 적용' })) return;
    const [action, fixtureId] = selection.split(':');
    try { setError(''); await api.repair.mutateAsync({ expectedRevision: view.revision, fixtureId, action: action as 'remove' | 'restore' | 'replay', reason }); setSelection(''); setReason(''); } catch (cause) { setError(extractErrorMessage(cause, '경기를 변경하지 못했어요.')); }
  }
  return <details className="space-y-3"><summary className="min-h-11 cursor-pointer py-3 tm-text-label">미시작 경기 삭제·복원 / 취소·무효 재경기</summary>
    <p className="tm-text-caption">진행·공식 결과가 있는 경기는 삭제할 수 없어요. 누락 경기는 복원한 뒤 진행해야 편성을 완료할 수 있어요.</p>
    <label className="block tm-text-label">변경할 경기<select className={stageControl} value={selection} onChange={event => setSelection(event.target.value)}><option value="">{choices.length ? '경기와 작업 선택' : '변경 가능한 경기가 없어요'}</option>{choices.map(choice => <option key={choice.value} value={choice.value}>{choice.label}</option>)}</select></label>
    <label className="block tm-text-label">경기 변경 사유<textarea className={stageControl} value={reason} maxLength={500} onChange={event => setReason(event.target.value)} /></label>
    {error && <AlertBanner tone="error" message={error} />}<Button variant="neutral" disabled={!selection || !reason.trim() || api.repair.isPending} onClick={() => void save()}>경기 변경 적용</Button>{ConfirmModal}
  </details>;
}
