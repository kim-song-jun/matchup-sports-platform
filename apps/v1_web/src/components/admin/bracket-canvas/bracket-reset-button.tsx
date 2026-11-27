'use client';

import { useRef, useState } from 'react';
import { useIsMutating, useQueryClient } from '@tanstack/react-query';
import { RotateCcw } from 'lucide-react';
import { Button } from '@/components/v1-ui/button';
import { useConfirm } from '@/components/v1-ui/confirm-modal';
import { useBracketReset } from '@/hooks/use-bracket-reset';
import { extractErrorMessage } from '@/lib/error-message';

export function BracketResetButton({ tournamentId, canWrite, showToast }: {
  tournamentId: string; canWrite: boolean; showToast: (message: string, variant?: 'success' | 'error') => void;
}) {
  const api = useBracketReset(tournamentId), client = useQueryClient();
  const mutations = useIsMutating();
  const { confirm, ConfirmModal } = useConfirm();
  const [preparing, setPreparing] = useState(false), [error, setError] = useState<string | null>(null);
  const running = useRef(false);
  if (!canWrite) return null;

  async function reset() {
    if (!canWrite || running.current || mutations > 0) return;
    running.current = true; setPreparing(true); setError(null);
    let saved = false;
    try {
      const preview = await api.preview();
      if (!preview.canReset) { setError(preview.blockedReason ?? '현재 대진은 초기화할 수 없어요.'); return; }
      const accepted = await confirm({ title: '대진 초기화', tone: 'danger', confirmLabel: '대진 초기화', confirmationText: '초기화한다',
        message: `${preview.fixtureCount}경기의 대진·일정·자리와 진출 연결을 초기화해요. 참가 신청·대회 규칙·등록 시간과 구장은 유지해요. ${preview.stageBased ? '단계 구성은 유지하고 단계별 팀 배정은 해제해요.' : preview.preservesPreliminaryGroups ? '예선 조 편성과 팀 선택은 유지하고 결선 진출팀 선택은 해제해요.' : '생성된 그룹과 팀 배정도 해제해요.'} 대진 공개도 해제되며 되돌릴 수 없어요. 초기화할까요?` });
      if (!accepted) return;
      const result = await api.reset.mutateAsync(preview.snapshot);
      saved = true;
      await client.invalidateQueries({ predicate: query => query.queryKey.some(key => key === tournamentId) }, { throwOnError: true });
      showToast(`${result.deletedFixtureCount}경기의 대진을 초기화했어요.`, 'success');
    } catch (cause) {
      const reason = extractErrorMessage(cause, '대진을 초기화하지 못했어요.');
      setError(saved ? `대진은 초기화됐지만 최신 화면을 불러오지 못했어요. 새로고침해 확인해 주세요. ${reason}` : reason);
    } finally { running.current = false; setPreparing(false); }
  }

  return <div className="flex flex-col items-start gap-2 self-start">
    <Button type="button" variant="outline" disabled={preparing || mutations > 0} loading={preparing} onClick={() => void reset()}>{!preparing ? <RotateCcw size={16} aria-hidden="true" /> : null}대진 초기화</Button>
    {error ? <p role="alert" className="tm-text-caption text-[var(--red700)]">{error}</p> : null}
    {ConfirmModal}
  </div>;
}
