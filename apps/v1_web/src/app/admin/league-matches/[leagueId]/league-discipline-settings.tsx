'use client';

import { useState } from 'react';
import { useV1UpdateLeagueDiscipline } from '@/hooks/use-v1-api';
import { extractErrorMessage } from '@/lib/error-message';
import type { V1AdminLeagueDetail } from '@/types/league-match';

export function LeagueDisciplineSettings({ league, canWrite, showToast }: {
  league: V1AdminLeagueDetail;
  canWrite: boolean;
  showToast: (message: string, variant?: 'success' | 'error') => void;
}) {
  const update = useV1UpdateLeagueDiscipline(league.leagueId);
  const [editing, setEditing] = useState(false);
  const [yellow, setYellow] = useState('');
  const [red, setRed] = useState('');
  const [error, setError] = useState('');
  const loaded = league.yellowAccumulationLimit !== undefined && league.redCardSuspensionMatches !== undefined;
  const locked = league.fixtures.some((fixture) => ['LIVE', 'PAUSED', 'ENDED'].includes(fixture.gameState ?? ''));
  const startEditing = () => {
    setYellow(league.yellowAccumulationLimit == null ? '' : String(league.yellowAccumulationLimit));
    setRed(league.redCardSuspensionMatches == null ? '' : String(league.redCardSuspensionMatches));
    setError('');
    setEditing(true);
  };
  const save = async () => {
    if (!canWrite || locked || update.isPending || !loaded) return;
    const values = [yellow.trim(), red.trim()];
    if (values.some((value) => value !== '' && (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 20))) {
      setError('출전정지 규정은 1부터 20 사이의 정수로 입력해 주세요. 비우면 적용하지 않아요.');
      return;
    }
    setError('');
    try {
      await update.mutateAsync({
        yellowAccumulationLimit: values[0] === '' ? null : Number(values[0]),
        redCardSuspensionMatches: values[1] === '' ? null : Number(values[1]),
      });
      setEditing(false);
      showToast('출전정지 규정을 저장했어요.', 'success');
    } catch (cause) {
      setError(extractErrorMessage(cause, '출전정지 규정을 저장하지 못했어요.'));
    }
  };

  return (
    <section aria-label="출전정지 규정" className="mb-6 rounded-2xl border border-[var(--border)] bg-[var(--card-surface)] px-5 py-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[length:var(--font-size-label)] font-bold text-[var(--text-strong)]">출전정지 규정</h2>
          {!editing && <p className="mt-1 text-[length:var(--font-size-body-sm)] text-[var(--text-muted)]">
            {loaded
              ? `경고 누적 ${league.yellowAccumulationLimit == null ? '미적용' : `${league.yellowAccumulationLimit}장마다 1경기`} · 퇴장 ${league.redCardSuspensionMatches == null ? '미적용' : `${league.redCardSuspensionMatches}경기`}`
              : '규정 정보를 불러오지 못했어요. 화면을 다시 불러와 주세요.'}
          </p>}
        </div>
        {canWrite && !editing && loaded && !locked && <button type="button" onClick={startEditing} className="tm-btn tm-btn-sm tm-btn-neutral min-h-[44px]">수정</button>}
      </div>
      <p className="mt-2 text-[length:var(--font-size-caption)] text-[var(--text-muted)]">
        {locked ? '이미 시작한 경기가 있어 규정을 바꿀 수 없어요. 규정은 리그 첫 경기 전에 정해요.' : '리그 첫 경기 전에 정해요. 비우면 해당 출전정지를 적용하지 않아요.'}
      </p>
      {editing && <div className="mt-4 border-t border-[var(--border)] pt-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-[length:var(--font-size-body-sm)]">경고 누적 기준 (장)
            <input className="tm-input mt-1 min-h-[44px] w-full" inputMode="numeric" maxLength={2} placeholder="비우면 미적용" value={yellow} onChange={(event) => setYellow(event.target.value)} disabled={update.isPending || locked} />
          </label>
          <label className="text-[length:var(--font-size-body-sm)]">퇴장 출전정지 (경기)
            <input className="tm-input mt-1 min-h-[44px] w-full" inputMode="numeric" maxLength={2} placeholder="비우면 미적용" value={red} onChange={(event) => setRed(event.target.value)} disabled={update.isPending || locked} />
          </label>
        </div>
        {error && <p role="alert" className="mt-3 text-[length:var(--font-size-body-sm)] text-[var(--red700)]">{error}</p>}
        <div className="mt-3 flex justify-end gap-2">
          <button type="button" className="tm-btn tm-btn-sm tm-btn-neutral min-h-[44px]" disabled={update.isPending} onClick={() => setEditing(false)}>취소</button>
          <button type="button" className="tm-btn tm-btn-sm tm-btn-primary min-h-[44px]" disabled={update.isPending || locked} onClick={() => void save()}>{update.isPending ? '저장 중…' : '저장'}</button>
        </div>
      </div>}
    </section>
  );
}
