import { formatPublicationTime, resolvePublicLineupAt, serverRosterEntries } from '@/app/team-matches/[id]/lineup/lineup.view-model';
import type { V1TeamMatchLineup } from '@/types/api';
import type { TeamMatchDetailViewModel } from './team-matches.types';

export type TeamMatchAttendanceSummary = NonNullable<NonNullable<TeamMatchDetailViewModel['progress']>['attendance']>;

/**
 * 진행 체크리스트 "참석명단 제출" 칸에 붙는 우리 인원과 상대 명단 상태(H5 D-1).
 * 두 팀 명단은 같은 공개 시각(기본 킥오프 1시간 전)에 열린다 — 그 전엔 상대의 제출 여부만, 뒤엔 [보기]로 번호·이름을 읽는다.
 */
export function buildAttendanceSummary(
  teamMatchId: string,
  lineup: V1TeamMatchLineup,
  kickoffAt: string | null | undefined,
  now: number,
): TeamMatchAttendanceSummary {
  const submitted = lineup.state === 'SUBMITTED' || lineup.state === 'LOCKED';
  const publicAt = resolvePublicLineupAt(lineup.publicLineupAt, kickoffAt);
  const time = formatPublicationTime(publicAt, now);
  const publishTimePassed = publicAt !== null && Date.parse(publicAt) <= now;
  const opponent = lineup.opponent;
  return {
    ownCount: submitted ? serverRosterEntries(lineup).length : null,
    opponent: opponent && opponent.teamName !== null
      ? {
          name: opponent.teamName,
          badge: opponent.published
            ? { tone: 'blue', label: `공개됨 · ${opponent.participantCount ?? 0}명` }
            : opponent.submitted
              ? { tone: 'green', label: '제출 완료' }
              : { tone: 'grey', label: '제출 전' },
          note: opponent.published
            ? time === null ? '상대 팀 명단이 공개됐어요' : `${time}에 공개됐어요`
            : publishTimePassed
              ? '상대 팀이 아직 참석명단을 내지 않았어요'
              : time === null
                ? '지금은 제출 여부만 보여요'
                : `명단은 ${time}에 서로 공개돼요 · 지금은 제출 여부만 보여요`,
          viewHref: opponent.published ? `/team-matches/${teamMatchId}/lineup/opponent` : null,
        }
      : null,
  };
}
