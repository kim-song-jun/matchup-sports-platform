import { V1ApiError } from '@/lib/api-client';
import { formatTournamentDateTimeShort } from '@/lib/date-utils';
import type { V1TeamDissolutionBlocker } from '@/types/api';

const BLOCKER_KIND_LABELS: Record<V1TeamDissolutionBlocker['kind'], string> = {
  live_game: '진행 중인 경기',
  matched_team_match: '상대가 정해진 팀매치',
  league_entry: '참가 중인 리그',
  tournament_entry: '참가 신청한 대회',
};

/** 팀 해체·운영팀 보관을 막는 조건 한 묶음의 제목. 예: "상대가 정해진 팀매치 2건" */
export function dissolutionBlockerTitle(kind: V1TeamDissolutionBlocker['kind'], count: number) {
  return `${BLOCKER_KIND_LABELS[kind]} ${count}건`;
}

/** 막는 항목 한 줄. 경기면 상대·일시·장소, 참가 신청이면 취소 요청 여부까지. */
export function dissolutionBlockerItemSummary(item: V1TeamDissolutionBlocker['items'][number]) {
  const when = [formatTournamentDateTimeShort(item.startAt), item.placeName].filter(Boolean).join(' ');
  const head = item.opponentName ? `${item.title} · vs ${item.opponentName}` : item.title;
  const status = item.registrationStatus === 'cancel_requested' ? '취소 요청 중' : null;
  return [head, when || null, status].filter(Boolean).join(' · ');
}

function isBlocker(value: unknown): value is V1TeamDissolutionBlocker {
  if (typeof value !== 'object' || value === null || !('kind' in value) || !('items' in value)) return false;
  return typeof value.kind === 'string' && value.kind in BLOCKER_KIND_LABELS && Array.isArray(value.items);
}

/** 409 `TEAM_DISSOLVE_BLOCKED` 의 `details.blockers`. 다른 오류이거나 모양이 다르면 null. */
export function dissolutionBlockersFromError(error: unknown): V1TeamDissolutionBlocker[] | null {
  if (!(error instanceof V1ApiError) || error.code !== 'TEAM_DISSOLVE_BLOCKED') return null;
  const details = error.details;
  if (typeof details !== 'object' || details === null || !('blockers' in details)) return null;
  const { blockers } = details;
  return Array.isArray(blockers) && blockers.length > 0 && blockers.every(isBlocker) ? blockers : null;
}
