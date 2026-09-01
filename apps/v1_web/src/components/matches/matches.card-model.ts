/**
 * 매치 목록·상세 화면이 API 응답(`V1Match`)을 카드 모델로 옮기는 순수 변환 로직.
 *
 * **이 파일에 `'use client'` 를 붙이지 않는다.** 매치 목록 페이지는 크롤러가 자바스크립트
 * 없이 받는 HTML 에도 실제 목록이 들어가야 하는데(그 전에는 빈 껍데기가 나갔다), 그러려면
 * 서버 컴포넌트가 같은 변환을 돌려 첫 화면을 미리 그려야 한다. 클라이언트 전용 파일에
 * 두면 서버가 이 함수들을 호출할 수 없어 마크업이 두 벌로 갈라진다.
 */
import { formatCardDate as formatDate, formatCardTime as formatTime } from '@/lib/date-utils';
import type { MatchCardModel, MatchListViewModel } from './matches.types';
import type { V1Match, V1MatchApiStatus, V1Sport, V1ViewerState } from '@/types/api';


export const FIXED_MATCH_SPORT_NAMES = ['축구', '풋살', '러닝', '수영'] as const;

export function toMatchCard(match: V1Match, fallback: MatchCardModel): MatchCardModel {
  const capacity = getCapacity(match, fallback);
  const status = statusToCardStatus(getStatus(match), getViewerState(match));

  return {
    ...fallback,
    id: match.matchId ?? match.id ?? fallback.id,
    title: match.title,
    sport: match.sport?.name ?? match.sportName ?? fallback.sport,
    venue: match.place?.name ?? match.placeName ?? fallback.venue,
    region: match.region?.name ?? match.regionName ?? fallback.region,
    date: formatDate(match.startsAt),
    time: formatTime(match.startsAt),
    endTime: match.endsAt ? formatTime(match.endsAt) : undefined,
    current: capacity.current,
    capacity: capacity.capacity,
    level: match.levelLabel ?? fallback.level,
    gender: match.genderRule ?? fallback.gender,
    host: match.host?.displayName ?? fallback.host,
    image: match.imageUrl ?? fallback.image,
    status,
    deadline: formatDeadline(match.deadlineAt, status),
    deadlineDetail: formatDeadlineDetail(match.deadlineAt, status),
    actionLabel: actionLabel(status),
  };
}

export function buildSportSummary(params: URLSearchParams, items: V1Match[], fallback: MatchListViewModel, selectedSportId?: string, masterSports?: V1Sport[]) {
  const counts = new Map<string, number>();
  items.forEach((item) => {
    const name = item.sport?.name ?? item.sportName ?? '기타';
    counts.set(name, (counts.get(name) ?? 0) + 1);
  });

  const fixedSports = FIXED_MATCH_SPORT_NAMES.map((name) => {
    const sport = masterSports?.find((item) => item.name === name);
    return {
      label: name,
      count: counts.get(name) ?? 0,
      active: sport?.id === selectedSportId,
      href: sport?.id ? buildMatchHref(params, { sportId: sport.id, filter: null }) : buildMatchHref(params, { sportId: null, filter: null }),
    };
  });

  return [
    { label: fallback.sports[0]?.label ?? '전체', count: items.length, active: !selectedSportId, href: buildMatchHref(params, { sportId: null, filter: null }) },
    ...fixedSports,
  ];
}

export function buildMatchHref(params: URLSearchParams, overrides: Record<string, string | null>) {
  const next = new URLSearchParams(params.toString());
  Object.entries(overrides).forEach(([key, value]) => {
    if (value === null || value === '') next.delete(key);
    else next.set(key, value);
  });
  const queryString = next.toString();
  return queryString ? `/matches?${queryString}` : '/matches';
}

/**
 * '오늘'의 기준은 **KST 달력 날짜**다. 이 함수는 서버 렌더에서도 호출되는데, 서버 런타임은
 * 대개 UTC 라 로컬 시각으로 비교하면 자정 전후로 크롤러와 브라우저가 다른 숫자를 본다.
 */
export function countToday(items: V1Match[]) {
  const today = kstDateKey(new Date());
  return items.filter((item) => {
    const date = new Date(item.startsAt);
    return !Number.isNaN(date.getTime()) && kstDateKey(date) === today;
  }).length;
}

/** KST 달력 기준 'YYYY-MM-DD'. en-CA 로케일이 그 형식을 그대로 준다. */
function kstDateKey(date: Date): string {
  return date.toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
}

export function getCapacity(match: V1Match, fallback: MatchCardModel) {
  if (typeof match.participantCount === 'number' && typeof match.capacity === 'number') {
    return { current: match.participantCount, capacity: match.capacity };
  }

  const [current, capacity] = match.capacityText?.match(/\d+/g)?.map(Number) ?? [];
  return {
    current: current ?? fallback.current,
    capacity: capacity ?? match.capacity ?? fallback.capacity,
  };
}

export function getStatus(match: V1Match): V1MatchApiStatus {
  const base = (match.displayState as V1MatchApiStatus | undefined) ?? (match.status as V1MatchApiStatus);
  // 마감 UX 선행: deadlineAt < now 면 모집 종료로 표시
  if (base === 'recruiting' || base === 'open') {
    const dl = match.deadlineAt ? new Date(match.deadlineAt) : null;
    if (dl && !Number.isNaN(dl.getTime()) && dl.getTime() < Date.now()) return 'closed';
  }
  return base;
}

export function getViewerState(match: V1Match, preflight?: Exclude<V1ViewerState, 'guest'>): V1ViewerState {
  return preflight ?? match.viewer?.state ?? match.viewerState ?? 'none';
}

export function statusToCardStatus(status: V1MatchApiStatus, viewerState: V1ViewerState = 'none'): MatchCardModel['status'] {
  if (viewerState === 'host') return 'mine';
  if (viewerState === 'requested') return 'pending';
  if (viewerState === 'approved' || viewerState === 'participant') return 'approved';
  if (status === 'closed' || status === 'cancelled' || status === 'completed' || status === 'expired' || status === 'full') return 'full';
  return 'open';
}

export function actionLabel(status: MatchCardModel['status']) {
  if (status === 'pending') return '승인 대기';
  if (status === 'approved') return '승인 완료';
  if (status === 'full') return '신청 마감';
  if (status === 'mine') return '내 매치';
  return '참가 신청';
}

export function formatDeadline(value: string | null | undefined, status: MatchCardModel['status']) {
  if (status === 'pending') return '승인 대기';
  if (status === 'approved') return '승인 완료';
  if (status === 'full') return '신청 마감';
  if (status === 'mine') return '내 매치';
  if (!value) return '신청 가능';

  const deadline = new Date(value);
  if (Number.isNaN(deadline.getTime())) return '신청 가능';
  const diffMs = deadline.getTime() - Date.now();
  if (diffMs <= 0) return '신청 마감';
  const diffHours = Math.ceil(diffMs / 3_600_000);
  if (diffHours < 24) return `마감 ${diffHours}시간 전`;
  const diffDays = Math.ceil(diffHours / 24);
  return `마감 ${diffDays}일 전`;
}

export function formatDeadlineDetail(value: string | null | undefined, status: MatchCardModel['status']) {
  if (status === 'pending') return '승인 대기';
  if (status === 'approved') return '승인 완료';
  if (status === 'full') return '신청 마감';
  if (status === 'mine') return '내 매치';
  if (!value) return '경기 시작 전까지';

  const deadline = new Date(value);
  if (Number.isNaN(deadline.getTime())) return '경기 시작 전까지';
  return `${formatDate(value)} ${formatTime(value)}`;
}


