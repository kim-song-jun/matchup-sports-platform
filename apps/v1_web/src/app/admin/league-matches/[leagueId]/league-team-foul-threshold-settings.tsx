'use client';

import { useState } from 'react';
import { useV1UpdateLeagueDiscipline } from '@/hooks/use-v1-api';
import { extractErrorMessage } from '@/lib/error-message';
import { TeamFoulPublicSwitch } from '@/components/admin/team-foul-public-switch';
import {
  DEFAULT_TEAM_FOUL_THRESHOLD,
  parseTeamFoulThresholdInput,
  TEAM_FOUL_THRESHOLD_ERROR,
} from '@/lib/team-foul-counter';
import type { V1AdminLeagueDetail } from '@/types/league-match';

/**
 * 팀 파울 기준 — 한 팀의 파울이 이 개수에 이르면 경기 운영 화면이 "다음부터 10m 프리킥"으로 예고하고, 넘으면 "세컨 파울 · 10m 프리킥"으로 알린다.
 *
 * 옆의 출전정지 규정 카드(`LeagueDisciplineSettings`)와 달리 **잠그지 않는다.** 출전정지는 이미 치른 경기의
 * 카드까지 소급해서 세므로 첫 경기 전에만 정하지만, 이 값은 화면 안내 기준일 뿐 기록·판정을 바꾸지 않아
 * 리그가 진행 중이어도 바꿀 수 있어야 한다(중간 수정 요구).
 */
export function LeagueTeamFoulThresholdSettings({ league, canWrite, showToast }: {
  league: V1AdminLeagueDetail;
  canWrite: boolean;
  showToast: (message: string, variant?: 'success' | 'error') => void;
}) {
  const update = useV1UpdateLeagueDiscipline(league.leagueId);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  // 필드가 없던 구버전 응답에서는 "기본 5개"로 읽지 않고 불러오지 못했다고 알린다 — 값을 모른 채 저장하면
  // 직접 정한 값을 덮어쓸 수 있다.
  const loaded = league.teamFoulThreshold !== undefined;
  const startEditing = () => {
    setValue(league.teamFoulThreshold == null ? '' : String(league.teamFoulThreshold));
    setError('');
    setEditing(true);
  };
  const save = async () => {
    if (!canWrite || update.isPending || !loaded) return;
    const parsed = parseTeamFoulThresholdInput(value);
    if (parsed === 'invalid') {
      setError(TEAM_FOUL_THRESHOLD_ERROR);
      return;
    }
    setError('');
    try {
      // 이 카드의 칸만 보낸다 — 출전정지 두 칸을 같이 보내면 첫 경기 뒤 서버가 잠금(409)으로 거절한다.
      await update.mutateAsync({ teamFoulThreshold: parsed });
      setEditing(false);
      showToast('팀 파울 기준을 저장했어요.', 'success');
    } catch (cause) {
      setError(extractErrorMessage(cause, '팀 파울 기준을 저장하지 못했어요.'));
    }
  };

  // 관전 화면 팀 파울 표시 — 스위치를 누르면 바로 저장한다(경기 진행 중에도 바꿀 수 있고, 기준 개수와 따로 저장된다).
  const shown = league.showTeamFouls ?? true;
  const toggleShown = async (next: boolean) => {
    if (!canWrite || update.isPending || !loaded) return;
    try {
      await update.mutateAsync({ showTeamFouls: next });
      showToast(next ? '관전 화면에 팀 파울을 보여줘요.' : '관전 화면에서 팀 파울을 숨겼어요.', 'success');
    } catch (cause) {
      showToast(extractErrorMessage(cause, '팀 파울 표시 설정을 저장하지 못했어요.'), 'error');
    }
  };

  return (
    <section aria-label="팀 파울 기준" className="mb-6 rounded-2xl border border-[var(--border)] bg-[var(--card-surface)] px-5 py-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[length:var(--font-size-label)] font-bold text-[var(--text-strong)]">팀 파울 기준</h2>
          {!editing && <p className="mt-1 text-[length:var(--font-size-body-sm)] text-[var(--text-muted)]">
            {loaded
              ? league.teamFoulThreshold == null
                ? `기본 ${DEFAULT_TEAM_FOUL_THRESHOLD}개`
                : `${league.teamFoulThreshold}개`
              : '팀 파울 기준을 불러오지 못했어요. 화면을 다시 불러와 주세요.'}
          </p>}
        </div>
        {canWrite && !editing && loaded && <button type="button" onClick={startEditing} className="tm-btn tm-btn-sm tm-btn-neutral min-h-[44px]">수정</button>}
      </div>
      <p className="mt-2 text-[length:var(--font-size-caption)] text-[var(--text-muted)]">
        한 팀의 파울이 이 개수에 이르면 경기 운영 화면이 &lsquo;다음부터 10m 프리킥&rsquo;으로 예고하고, 이 개수를 넘으면 &lsquo;세컨 파울 · 10m 프리킥&rsquo;으로 알려요. 경기 진행 중에도 바꿀 수 있어요.
      </p>
      {canWrite && loaded && <TeamFoulPublicSwitch checked={shown} onChange={(next) => void toggleShown(next)} disabled={update.isPending} />}
      {editing && <div className="mt-4 border-t border-[var(--border)] pt-4">
        <label className="text-[length:var(--font-size-body-sm)]">팀 파울 기준 (개)
          <input
            className="tm-input mt-1 min-h-[44px] w-full sm:max-w-[240px]"
            inputMode="numeric"
            maxLength={2}
            placeholder={`비우면 ${DEFAULT_TEAM_FOUL_THRESHOLD}개`}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            disabled={update.isPending}
          />
        </label>
        {error && <p role="alert" className="mt-3 text-[length:var(--font-size-body-sm)] text-[var(--red700)]">{error}</p>}
        <div className="mt-3 flex justify-end gap-2">
          <button type="button" className="tm-btn tm-btn-sm tm-btn-neutral min-h-[44px]" disabled={update.isPending} onClick={() => setEditing(false)}>취소</button>
          <button type="button" className="tm-btn tm-btn-sm tm-btn-primary min-h-[44px]" disabled={update.isPending} onClick={() => void save()}>{update.isPending ? '저장 중…' : '저장'}</button>
        </div>
      </div>}
    </section>
  );
}
