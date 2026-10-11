import type { GameResultGoalEventInput } from '@/hooks/use-tournament-result-review';

/**
 * 서버(`assertGoalTimelineConsistent`)가 정정·재제출을 422 로 거부하는 두 조건을
 * 제출 전에 같은 기준으로 계산한다: 점수 = 팀별 득점 기록 수, 선수 득점 = 그 선수의
 * 자책골 아닌 득점 기록 수.
 */
export type GoalTimelineInput = {
  score: { home: number; away: number };
  homeSideId: string | undefined;
  awaySideId: string | undefined;
  goalEvents: readonly GameResultGoalEventInput[];
  participants: readonly { participantId: string; goals: number }[];
};

export function describeGoalTimelineMismatch(input: GoalTimelineInput): string | null {
  const { score, homeSideId, awaySideId, goalEvents, participants } = input;
  const homeRecorded = goalEvents.filter((event) => event.sideId === homeSideId).length;
  const awayRecorded = goalEvents.filter((event) => event.sideId === awaySideId).length;
  if (homeRecorded !== score.home || awayRecorded !== score.away) {
    return `점수(${score.home}:${score.away})와 득점 기록(${homeRecorded}:${awayRecorded})이 달라요. 점수와 득점 기록 수를 같게 맞춰 주세요.`;
  }

  const personalGoals = new Map<string, number>();
  for (const event of goalEvents) {
    if (event.ownGoal || !event.participantId) continue;
    personalGoals.set(event.participantId, (personalGoals.get(event.participantId) ?? 0) + 1);
  }
  const mismatched = participants.some(
    (participant) => participant.goals !== (personalGoals.get(participant.participantId) ?? 0),
  );
  return mismatched
    ? '선수별 득점 수가 득점 기록과 달라요. 선수별 득점 수를 득점 기록에 맞춰 주세요.'
    : null;
}
