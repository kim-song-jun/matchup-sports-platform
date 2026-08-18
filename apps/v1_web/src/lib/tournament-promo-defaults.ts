import { formatTournamentDateRangeShort } from '@/lib/date-utils';

/**
 * 홍보 카드(홈 오늘의 추천 · 대회 목록 상단)의 "사실 문구" 4종 — 날짜/팀/장소/상금.
 *
 * 이 4개는 카드 제목·배지·소개 문구와 달리 공개 화면에 폴백이 없어서(비면 아예 렌더되지
 * 않는다 — components/home/tournament-hero-card.tsx, app/tournaments/page.tsx 배너),
 * 관리자가 직접 쓰지 않으면 카드가 빈약해진다. 그런데 값 자체는 대회 생성 폼 앞 단계에
 * 이미 다 있으므로, 관리자가 손대지 않은 문구는 여기서 파생한 기본값으로 채운다.
 */
export const PROMO_FACT_KEYS = ['dateText', 'teamsText', 'locationText', 'prizeText'] as const;

export type PromoFactKey = (typeof PROMO_FACT_KEYS)[number];

/** 4개 문구가 각각 "관리자가 직접 건드린 값"인지 — true면 자동 동기화 대상에서 빠진다. */
export type PromoFactsDirty = Record<PromoFactKey, boolean>;

export const EMPTY_PROMO_FACTS_DIRTY: PromoFactsDirty = {
  dateText: false,
  teamsText: false,
  locationText: false,
  prizeText: false,
};

/** 파생 기본값의 입력 — 대회 생성 폼의 앞 단계 값(문자열 폼 상태 그대로)을 받는다. */
export type TournamentPromoFactSource = {
  /** 대회 시작 일시 — ISO 또는 datetime-local 문자열 */
  scheduledAt: string | null | undefined;
  /** 대회 종료 일시 — 시작일과 같거나 비어 있으면 단일 날짜로 표기한다 */
  scheduledEndAt: string | null | undefined;
  /** 참가 팀 수 — 폼의 문자열 값 그대로 받아 숫자로 해석한다 */
  teamCount: string | null | undefined;
  venue: string | null | undefined;
  /** 총 상금 — 폼의 문자열 값 그대로 */
  prizePool: string | null | undefined;
  prizeSummary: string | null | undefined;
};

/**
 * 앞 단계 값에서 홍보 카드 사실 문구를 만든다. 만들 수 없는 항목은 빈 문자열 —
 * 빈 문자열은 "채울 게 없다"는 뜻이라 기존 값을 지우지 않고 그대로 둔다(applyPromoFactDefaults).
 */
export function buildTournamentPromoFactDefaults(
  source: TournamentPromoFactSource,
): Record<PromoFactKey, string> {
  return {
    dateText: formatTournamentDateRangeShort(source.scheduledAt, source.scheduledEndAt) ?? '',
    teamsText: formatTeamCount(source.teamCount),
    locationText: source.venue?.trim() ?? '',
    prizeText: formatPrizeText(source.prizeSummary, source.prizePool),
  };
}

/**
 * dirty가 아닌 문구만 기본값으로 덮어쓴다. 관리자가 한 번이라도 직접 고친 문구는
 * (빈 칸으로 지운 경우까지 포함해) 그대로 둔다 — 지운 것도 명시적 선택이기 때문이다.
 */
export function applyPromoFactDefaults<T extends Record<PromoFactKey, string>>(
  value: T,
  defaults: Record<PromoFactKey, string>,
  dirty: PromoFactsDirty,
): T {
  let changed = false;
  const next = { ...value };
  for (const key of PROMO_FACT_KEYS) {
    if (dirty[key]) continue;
    const fallback = defaults[key];
    if (!fallback || next[key] === fallback) continue;
    next[key] = fallback;
    changed = true;
  }
  return changed ? next : value;
}

/** 두 홍보 값의 사실 문구를 비교해, 바뀐 키를 dirty로 표시한 새 dirty 맵을 만든다. */
export function markChangedPromoFacts(
  previous: Record<PromoFactKey, string>,
  next: Record<PromoFactKey, string>,
  dirty: PromoFactsDirty,
): PromoFactsDirty {
  let changed = false;
  const result = { ...dirty };
  for (const key of PROMO_FACT_KEYS) {
    if (result[key] || previous[key] === next[key]) continue;
    result[key] = true;
    changed = true;
  }
  return changed ? result : dirty;
}

function formatTeamCount(teamCount: string | null | undefined): string {
  const parsed = Number(teamCount?.trim());
  if (!Number.isFinite(parsed) || parsed <= 0) return '';
  return `${parsed}팀`;
}

function formatPrizeText(
  prizeSummary: string | null | undefined,
  prizePool: string | null | undefined,
): string {
  const summary = prizeSummary?.trim();
  if (summary) return summary;
  const pool = Number(prizePool?.trim());
  if (!Number.isFinite(pool) || pool <= 0) return '';
  return `총 상금 ${pool.toLocaleString('ko-KR')}원`;
}
