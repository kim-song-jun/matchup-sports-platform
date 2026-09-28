'use client';

import { AlertBanner } from '@/components/v1-ui/primitives';
import { useV1MemberUnavailability } from '@/hooks/use-v1-game-roster';
import { formatExclusiveEndRangeShort } from '@/lib/date-utils';
import { gameRosterReasonLabel } from '@/lib/v1-status-labels';
import { isActive } from './member-unavailability-sheet';

/**
 * 팀원 본인의 결장 기간(Task 176 팀 C, D6) — 선수는 등록할 수 없고 볼 수만 있다.
 * 지금 걸려 있거나 앞으로 걸릴 기간이 없으면 아무것도 띄우지 않는다(조회 실패도 조용히 — 이 화면의 본론이 아니다).
 */
export function MyUnavailabilityNotice({ teamId, userId }: { teamId: string; userId: string }) {
  const query = useV1MemberUnavailability(teamId, userId);
  const active = (query.data?.items ?? []).filter((item) => isActive(item));
  if (active.length === 0) return null;
  const periods = active
    .map((item) => {
      const range = formatExclusiveEndRangeShort(item.startsAt, item.endsAt) ?? '결장 기간';
      const reason = gameRosterReasonLabel(item.reason);
      return reason === null ? range : `${range}(${reason})`;
    })
    .join(', ');
  return (
    <AlertBanner
      tone="info"
      message={`내 결장 기간: ${periods}. 이 기간 대회·리그 경기에서 빠져요. 바꾸려면 팀장·매니저에게 알려 주세요.`}
    />
  );
}
