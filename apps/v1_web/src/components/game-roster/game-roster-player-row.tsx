import type { ReactNode } from 'react';
import type { V1TeamRosterCellStatus } from '@/hooks/use-v1-game-roster';
import {
  GAME_ROSTER_AUTO_ACTOR_LABEL,
  gameRosterActorRoleLabel,
  gameRosterReasonLabel,
  gameRosterStatusLabel,
} from '@/lib/v1-status-labels';

const BADGE_TONE: Record<V1TeamRosterCellStatus, string> = {
  PARTICIPATING: 'tm-badge-blue',
  EXCLUDED: 'tm-badge-grey',
  UNAVAILABLE: 'tm-badge-orange',
  SUSPENDED: 'tm-badge-red',
  NOT_IN_ROSTER: 'tm-badge-grey',
};

/** 배지 문구 — 색만으로 구분하지 않도록 상태를 글자로 싣고, 빠짐·결장은 사유를 잇는다. */
export function gameRosterBadgeText(status: V1TeamRosterCellStatus, reason?: string | null, remainingMatches?: number | null) {
  const statusLabel = gameRosterStatusLabel(status, remainingMatches);
  const reasonLabel = status === 'EXCLUDED' || status === 'UNAVAILABLE' ? gameRosterReasonLabel(reason) : null;
  return reasonLabel === null ? statusLabel : `${statusLabel} · ${reasonLabel}`;
}

/** 누가 이 상태를 만들었나. 출전정지는 계산 결과라 "자동", 출전·명단 밖은 주체가 없다. */
function actorCaption(status: V1TeamRosterCellStatus, actorRole: string | null | undefined): string | null {
  if (status === 'SUSPENDED') return `${GAME_ROSTER_AUTO_ACTOR_LABEL} 처리`;
  if (status !== 'EXCLUDED' && status !== 'UNAVAILABLE') return null;
  const label = gameRosterActorRoleLabel(actorRole);
  return label === null ? null : `${label} 처리`;
}

export interface GameRosterPlayerRowProps {
  jerseyNumber: number | null;
  displayName: string;
  /** false = 리그 폴백 팀원 — 경기 기록에 계정 없이 들어간다. */
  accountLinked: boolean;
  status: V1TeamRosterCellStatus;
  reason?: string | null;
  remainingMatches?: number | null;
  actorRole?: string | null;
  /** 이름 아래 한 줄 안내(예: 참가 명단 추가로 들어온 선수). */
  note?: string | null;
  /** 오른쪽 조작 영역(토글·버튼). 조작 요소의 44px 터치는 호출부가 맡는다. */
  trailing?: ReactNode;
}

/** 경기 명단 한 줄 — 경기 명단 화면·빠른 선택 시트·팀 표·어드민 펼침이 같이 쓴다. */
export function GameRosterPlayerRow({
  jerseyNumber,
  displayName,
  accountLinked,
  status,
  reason,
  remainingMatches,
  actorRole,
  note,
  trailing,
}: GameRosterPlayerRowProps) {
  const captions = [actorCaption(status, actorRole), accountLinked ? null : '계정 없이 기록돼요', note ?? null].filter(
    (part): part is string => part !== null && part !== '',
  );
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 44, padding: '8px 0' }}>
      <span
        className="tm-text-label"
        style={{ flex: '0 0 auto', minWidth: 28, textAlign: 'center', color: 'var(--text-muted)' }}
      >
        <span className="sr-only">등번호 </span>
        {jerseyNumber === null ? (
          <>
            <span className="sr-only">없음</span>
            <span aria-hidden="true">–</span>
          </>
        ) : (
          jerseyNumber
        )}
      </span>
      <div style={{ minWidth: 0, flex: '1 1 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <span className="tm-text-label" style={{ overflowWrap: 'anywhere' }}>
            {displayName}
          </span>
          <span className={`tm-badge tm-badge-sm ${BADGE_TONE[status]}`}>
            {gameRosterBadgeText(status, reason, remainingMatches)}
          </span>
        </div>
        {captions.length > 0 ? (
          <div className="tm-text-caption" style={{ marginTop: 4 }}>
            {captions.join(' · ')}
          </div>
        ) : null}
      </div>
      {trailing !== undefined ? <div style={{ flex: '0 0 auto' }}>{trailing}</div> : null}
    </div>
  );
}
