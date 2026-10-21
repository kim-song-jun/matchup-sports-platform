import type { V1Match, V1MatchParticipant } from '@prisma/client';
import type { ListStatusGroup } from '../common/pagination/list-status-groups';

type ParticipantFields = Pick<V1MatchParticipant, 'status' | 'role'>;
export type MatchStatusFields = Pick<V1Match, 'status' | 'startAt' | 'endAt' | 'deadlineAt' | 'maxParticipants' | 'proceedConfirmedAt'>;

/** 참가 인원. 노쇼는 진행 판정(includeNoShow)에서만 센다. */
export function matchParticipantCount(participants: readonly ParticipantFields[], includeNoShow = false): number {
  return participants.filter(
    (participant) => participant.status === 'active' || participant.status === 'completed' || (includeNoShow && participant.status === 'no_show'),
  ).length;
}

export function matchHostParticipates(participants: readonly ParticipantFields[]): boolean {
  return participants.some(
    (participant) => participant.role === 'host' && (participant.status === 'active' || participant.status === 'completed'),
  );
}

/** 저장 상태와 인원·시각으로 만든 API 상태. MatchesService.getApiStatus 가 이 함수를 쓴다. */
export function matchApiStatus(match: MatchStatusFields, participantCount: number, hostParticipantCount = 0, now = new Date()) {
  if (!['recruiting', 'closed'].includes(match.status)) return match.status;
  const count = participantCount;
  const canProceed = count > hostParticipantCount && (Boolean(match.proceedConfirmedAt) || count >= match.maxParticipants);
  if (match.startAt <= now) return canProceed ? ((match.endAt ?? match.startAt) <= now ? 'completion_pending' : 'in_progress') : 'on_hold';
  if (match.proceedConfirmedAt && count > hostParticipantCount) return 'scheduled';
  if ((match.deadlineAt && match.deadlineAt <= now) && !canProceed) return 'on_hold';
  return match.status;
}

/**
 * 공개 목록에서 이 매치가 들어갈 묶음(list-status-groups.ts). 카드가 그리는 상태와 같은 기준이다.
 * - 진행 중: 경기 중(in_progress).
 * - 신청 가능: 모집 중 · 정원 남음 · 신청 마감 전.
 * - 경기 예정: 진행이 확정됐거나(scheduled) 정원이 찼다(시작 전).
 * - 신청 마감: 마감이 지났는데 인원이 모자라 보류(on_hold)거나 직접 마감, 시작 전.
 * - 끝난 경기: 종료 확인 중·완료, 시작이 지나도록 열리지 못한 매치.
 * `at` 은 첫 페이지 시각이라 스크롤하는 동안 카드가 묶음 사이를 옮기지 않는다.
 */
export function matchListGroup(match: MatchStatusFields & { participants: readonly ParticipantFields[] }, at: Date): ListStatusGroup {
  const status = matchApiStatus(match, matchParticipantCount(match.participants, true), matchHostParticipates(match.participants) ? 1 : 0, at);
  const upcoming = match.startAt > at;
  if (status === 'in_progress') return 'live';
  if (status === 'scheduled') return 'scheduled';
  if (status === 'recruiting') {
    if (matchParticipantCount(match.participants) >= match.maxParticipants) return 'scheduled';
    return match.deadlineAt !== null && match.deadlineAt <= at ? 'closed' : 'open';
  }
  if ((status === 'on_hold' || status === 'closed') && upcoming) return 'closed';
  return 'ended';
}
