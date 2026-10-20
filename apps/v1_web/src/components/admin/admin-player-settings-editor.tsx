'use client';

import { useState } from 'react';
import { useV1AdminUpdatePlayerSettings } from '@/hooks/use-v1-api';
import type { V1AdminTournamentPlayer } from '@/types/api';
import { extractErrorMessage } from '@/lib/error-message';

export function AdminPlayerSettingsEditor({ registrationId, player, canWrite, showToast }: {
  registrationId: string;
  player: V1AdminTournamentPlayer;
  canWrite: boolean;
  showToast: (message: string, variant?: 'success' | 'error') => void;
}) {
  const update = useV1AdminUpdatePlayerSettings(registrationId);
  const [editing, setEditing] = useState(false);
  const [number, setNumber] = useState('');
  const [goalkeeper, setGoalkeeper] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const begin = () => {
    setNumber(player.jerseyNumber == null ? '' : String(player.jerseyNumber));
    setGoalkeeper(player.goalkeeper ?? false);
    setError(null);
    setEditing(true);
  };
  const save = () => {
    const value = number.trim();
    if (value !== '' && (!/^\d+$/.test(value) || Number(value) > 99)) {
      setError('등번호는 0에서 99 사이의 정수로 입력해 주세요.');
      return;
    }
    update.mutate({
      playerId: player.id, jerseyNumber: value === '' ? null : Number(value),
      ...(goalkeeper !== (player.goalkeeper ?? false) ? { goalkeeper } : {}),
    }, {
      onSuccess: () => {
        setEditing(false);
        showToast(`${player.realName} 선수 설정을 저장했어요.`, 'success');
      },
      onError: (err) => setError(extractErrorMessage(err, '선수 설정을 저장하지 못했어요.')),
    });
  };

  return (
    <div className="basis-full" aria-label={`${player.realName} 선수 설정`}>
      {editing && canWrite ? (
        <div className="flex flex-wrap items-end gap-2">
          <label className="tm-text-caption text-[var(--text-muted)]">
            등번호
            <input
              aria-label={`${player.realName} 등번호`}
              type="text" inputMode="numeric" value={number}
              onChange={(event) => { setNumber(event.target.value); setError(null); }}
              disabled={update.isPending} placeholder="미지정" maxLength={3}
              className="mt-1 block h-[44px] w-24 rounded-xl border border-[var(--border)] bg-[var(--card-surface)] px-3 tm-text-label text-[var(--text-strong)]"
            />
          </label>
          <label className="flex min-h-[44px] items-center gap-2 px-2 tm-text-label text-[var(--text-strong)]">
            <input type="checkbox" aria-label={`${player.realName} GK`} checked={goalkeeper}
              disabled={update.isPending} onChange={(event) => setGoalkeeper(event.target.checked)} />
            GK(골키퍼)
          </label>
          <button type="button" className="tm-btn tm-btn-sm tm-btn-primary min-h-[44px]"
            disabled={update.isPending} onClick={save} aria-label={`${player.realName} 선수 설정 저장`}>
            {update.isPending ? '저장 중…' : '저장'}
          </button>
          <button type="button" className="tm-btn tm-btn-sm tm-btn-outline min-h-[44px]"
            disabled={update.isPending} onClick={() => { setEditing(false); setError(null); }}>
            취소
          </button>
          <p className="basis-full tm-text-caption text-[var(--text-muted)]">번호를 비우면 미지정으로 저장해요. 시작 전 경기 명단에도 반영돼요.</p>
          {error ? <p role="alert" className="basis-full tm-text-label text-[var(--red700)]">{error}</p> : null}
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2">
          <span className="tm-text-caption text-[var(--text-muted)]">{player.goalkeeper ? 'GK(골키퍼)' : '필드 선수'}</span>
          {canWrite ? <button type="button" onClick={begin}
            className="tm-btn tm-btn-sm tm-btn-outline min-h-[44px]" aria-label={`${player.realName} 선수 설정 수정`}>수정</button> : null}
        </div>
      )}
    </div>
  );
}
