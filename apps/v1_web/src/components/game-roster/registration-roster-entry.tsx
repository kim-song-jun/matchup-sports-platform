'use client';

import Link from 'next/link';
import { ChevronRightIcon } from '@/components/v1-ui/icons';
import { useCurrentHref } from '@/components/v1-ui/use-current-href';
import type { V1GameRosterView } from '@/hooks/use-v1-game-roster';
import { registrationRosterPath } from '@/lib/game-roster-routes';
import { withFromPath } from '@/lib/session-storage';
import { useV1Tournament } from '@/hooks/use-v1-api';
import { isTournamentRosterMutable } from '@/lib/roster-editability';
import { extractErrorMessage } from '@/lib/error-message';

/**
 * 경기 명단에서 대회·리그 참가 명단으로 가는 한 줄(Task 180 R-1 C).
 * 경기 명단은 "이번 경기 빠짐"만 바꾸고, 선수 추가·아예 빼기·등번호는 참가 명단이 맡는다 — 그 차이를 같은 자리에서 말한다.
 * 참가 명단을 고치는 팀장·매니저에게만 보인다.
 */
export function RegistrationRosterEntry({
  view,
  variant,
}: {
  view: Pick<V1GameRosterView, 'viewerRole' | 'competitionId' | 'competitionKind' | 'jerseyRegistrationId'>;
  /** block: 경기 명단 화면 출전 목록 끝 · inline: 경기 상세 "우리 팀 출전" 카드 아래 한 줄 */
  variant: 'block' | 'inline';
}) {
  const currentHref = useCurrentHref();
  const isLeague = view.competitionKind === 'LEAGUE';
  // 목적지와 같은 리그 전체 상태를 읽는다. 개별 경기 editable/LIVE/ENDED는 별도 축이다.
  const competition = useV1Tournament(isLeague && view.viewerRole === 'TEAM_MANAGER' ? view.competitionId : '');
  if (view.viewerRole !== 'TEAM_MANAGER') return null;
  const noun = isLeague ? '리그' : '대회';
  // 신청 id 가 없으면 참가 명단이 아직 없는 팀이다(팀원 전체가 기준) — 내 신청 화면에서 명단을 낸다.
  const hasRoster = view.jerseyRegistrationId !== null;
  const href = withFromPath(registrationRosterPath(view.competitionId, view.jerseyRegistrationId), currentHref);
  const status = competition.data?.status;
  const closedLeague = isLeague && (status === 'completed' || status === 'cancelled');
  const editHint = !isLeague || (!competition.isError && status !== undefined && isTournamentRosterMutable(competition.data));
  const unavailableMessage = closedLeague
    ? hasRoster
      ? `${status === 'cancelled' ? '취소된' : '종료된'} 리그의 참가 명단은 조회만 할 수 있어요.`
      : `${status === 'cancelled' ? '취소된' : '종료된'} 리그에서는 새 참가 명단을 낼 수 없어요. 신청 내역을 확인해 주세요.`
    : competition.isError
      ? `리그 상태를 불러오지 못했어요. ${extractErrorMessage(competition.error, '리그 상태 조회에 실패했어요.')} 참가 명단 화면에서 확인해 주세요.`
      : status === undefined
        ? '리그 상태를 확인하고 있어요. 참가 명단 화면에서 확인해 주세요.'
        : '리그 참가 명단의 편집 가능 여부는 참가 명단 화면에서 확인해 주세요.';
  const viewLabel = hasRoster ? '참가 명단' : '신청 내역';
  const readonlyLabel = `${viewLabel} ${closedLeague ? '보기' : '확인'}`;

  if (variant === 'inline') {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          marginTop: 8,
          paddingTop: 8,
          borderTop: '1px solid var(--border)',
        }}
      >
        <span className="tm-text-caption" style={{ wordBreak: 'keep-all' }}>
          {editHint ? `선수 추가·빼기와 등번호는 ${noun} 참가 명단에서 바꿔요` : unavailableMessage}
        </span>
        <Link
          href={href}
          className="tm-btn tm-btn-sm tm-btn-ghost"
          style={{ minHeight: 44, gap: 2, flex: '0 0 auto', color: 'var(--blue700)' }}
        >
          {editHint ? '참가 명단' : readonlyLabel}
          <ChevronRightIcon size={14} strokeWidth={2.2} aria-hidden="true" />
        </Link>
      </div>
    );
  }

  return (
    <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
      <p className="tm-text-caption" style={{ margin: '0 0 8px', color: 'var(--text-muted)', wordBreak: 'keep-all' }}>
        {!editHint ? unavailableMessage : hasRoster
          ? `선수를 더하거나 명단에서 아예 빼려면 ${noun} 참가 명단에서 바꿔요. 바꾸면 시작 전 경기에 모두 반영돼요.`
          : `${noun} 참가 명단을 내면 그 선수들로 경기 명단이 정해져요.`}
      </p>
      <Link href={href} className="tm-btn tm-btn-md tm-btn-outline tm-btn-block" style={{ minHeight: 44, gap: 4 }}>
        {!editHint ? readonlyLabel : hasRoster ? '참가 명단에서 선수 추가·빼기' : '참가 명단 내러 가기'}
        <ChevronRightIcon size={16} strokeWidth={2.2} aria-hidden="true" />
      </Link>
    </div>
  );
}
