import type { CSSProperties, ReactNode } from 'react';
import { Button } from '@/components/v1-ui/button';
import { PlusIcon } from '@/components/v1-ui/icons';
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
function gameRosterBadgeText(status: V1TeamRosterCellStatus, reason?: string | null, remainingMatches?: number | null) {
  const statusLabel = gameRosterStatusLabel(status, remainingMatches);
  const reasonLabel = status === 'EXCLUDED' || status === 'UNAVAILABLE' ? gameRosterReasonLabel(reason) : null;
  return reasonLabel === null ? statusLabel : `${statusLabel} · ${reasonLabel}`;
}

/** 경기 명단 상태 배지 — 명단 화면·표 밖(친선 참석명단의 결장 표시)에서도 같은 모양·문구로 쓴다. */
export function GameRosterStatusBadge({
  status,
  reason,
  remainingMatches,
}: {
  status: V1TeamRosterCellStatus;
  reason?: string | null;
  remainingMatches?: number | null;
}) {
  return (
    <span className={`tm-badge tm-badge-sm ${BADGE_TONE[status]}`}>
      {gameRosterBadgeText(status, reason, remainingMatches)}
    </span>
  );
}

/** 누가 이 상태를 만들었나. 출전정지는 계산 결과라 "자동", 출전·명단 밖은 주체가 없다. */
function actorCaption(status: V1TeamRosterCellStatus | undefined, actorRole: string | null | undefined): string | null {
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
  /** 없으면 상태 배지를 그리지 않는다 — 친선 참석명단처럼 "있으면 출전"인 목록(H5). */
  status?: V1TeamRosterCellStatus;
  /** 상태 배지 뒤에 붙는 읽기 전용 칩(예: 팀 일정 응답). */
  extraBadges?: ReactNode;
  reason?: string | null;
  remainingMatches?: number | null;
  actorRole?: string | null;
  /** 이름 아래 한 줄 안내(예: 참가 명단 추가로 들어온 선수). */
  note?: string | null;
  /** 오른쪽 조작 영역(토글·버튼). 조작 요소의 44px 터치는 호출부가 맡는다. */
  trailing?: ReactNode;
  /** 있으면 등번호 칸이 버튼이 된다 — 눌러서 번호를 넣거나 바꾼다(빈 칸은 점선 "+"). */
  onJerseyPress?: () => void;
}

/** 경기 명단 한 줄 — 경기 명단 화면·빠른 선택 시트·팀 표·어드민 펼침이 같이 쓴다. */
export function GameRosterPlayerRow({
  jerseyNumber,
  displayName,
  accountLinked,
  status,
  extraBadges,
  reason,
  remainingMatches,
  actorRole,
  note,
  trailing,
  onJerseyPress,
}: GameRosterPlayerRowProps) {
  const captions = [actorCaption(status, actorRole), accountLinked ? null : '계정 없이 기록돼요', note ?? null].filter(
    (part): part is string => part !== null && part !== '',
  );
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 44, padding: '8px 0' }}>
      {onJerseyPress === undefined ? (
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
      ) : jerseyNumber === null ? (
        <Button
          variant="outline"
          size="sm"
          onClick={onJerseyPress}
          aria-label={`${displayName} 등번호 넣기`}
          style={emptyJerseyButtonStyle}
        >
          <PlusIcon size={16} strokeWidth={2} />
        </Button>
      ) : (
        <Button
          variant="neutral"
          size="sm"
          className="tab-num"
          onClick={onJerseyPress}
          aria-label={`${displayName} 등번호 ${jerseyNumber}번 바꾸기`}
          style={jerseyButtonStyle}
        >
          {jerseyNumber}
        </Button>
      )}
      <div style={{ minWidth: 0, flex: '1 1 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <span className="tm-text-label" style={{ overflowWrap: 'anywhere' }}>
            {displayName}
          </span>
          {status === undefined ? null : (
            <GameRosterStatusBadge status={status} reason={reason} remainingMatches={remainingMatches} />
          )}
          {extraBadges}
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

/** 출전 체크의 뜻 — 체크를 쓰는 화면마다 같은 문구로 보인다. */
export const GAME_ROSTER_PLAYING_HINT = '체크를 풀면 이번 경기에서 빠져요.';

/**
 * 이번 경기 출전 체크 — 경기 명단 화면과 빠른 선택 시트가 같이 쓴다. 두 화면 모두 체크 = 출전,
 * 풀면 빠짐이다(같은 모양의 행에서 뜻이 갈리지 않게). 44px 라벨이 터치 영역이다.
 */
export function GameRosterPlayingCheckbox({
  displayName,
  playing,
  onChange,
}: {
  displayName: string;
  playing: boolean;
  onChange: (playing: boolean) => void;
}) {
  return (
    <label style={checkboxLabelStyle}>
      <input
        type="checkbox"
        checked={playing}
        onChange={(event) => onChange(event.target.checked)}
        aria-label={`${displayName} 이번 경기 출전`}
        style={checkboxStyle}
      />
    </label>
  );
}

const checkboxLabelStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: 44,
  minHeight: 44,
  cursor: 'pointer',
};
const checkboxStyle: React.CSSProperties = { width: 22, height: 22, margin: 0, accentColor: 'var(--blue500)' };

const jerseyButtonStyle: CSSProperties = { flex: '0 0 auto', minWidth: 44, padding: 0, fontWeight: 700 };
const emptyJerseyButtonStyle: CSSProperties = {
  flex: '0 0 auto',
  minWidth: 44,
  padding: 0,
  borderStyle: 'dashed',
  color: 'var(--text-muted)',
};
