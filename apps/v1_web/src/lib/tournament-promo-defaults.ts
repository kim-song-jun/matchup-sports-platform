import { formatTournamentDateRangeMedium } from '@/lib/date-utils';

/**
 * 홍보 카드(홈 오늘의 추천 · 대회 목록 상단)에서 대회 정보로부터 그대로 만들 수 있는
 * 문구 3종 — 날짜/장소/상금. 홍보 섹션의 「다시 채우기」가 카드 문구를 이 값으로 되돌린다.
 *
 * teamsText(강조 문구)는 일부러 뺐다. 이름은 "팀 문구"였지만 운영에서는 팀 수가 아니라
 * "마감임박"처럼 상태를 강조하는 자유 문구로 쓰고 있어(2026-08-18 프로덕션 8개 홍보
 * 슬롯 전수 확인 — 팀 수로 쓴 사례 0건), 팀 수를 자동으로 넣으면 매번 지워야 한다.
 *
 * 날짜 형식은 프로덕션에서 관리자가 실제로 써 온 'M월 D일 (요일)'을 따른다(같은 확인에서
 * 4개 대회 중 3개가 이 형식). 목록 카드의 compact 표기('M/D (요일)')와는 일부러 다르다.
 */
export const PROMO_FACT_KEYS = ['dateText', 'locationText', 'prizeText'] as const;

type PromoFactKey = (typeof PROMO_FACT_KEYS)[number];

/** 파생 기본값의 입력 — 대회 정보의 값(상금은 문자열)을 받는다. */
type TournamentPromoFactSource = {
  /** 대회 시작 일시 — ISO 또는 datetime-local 문자열 */
  scheduledAt: string | null | undefined;
  /** 대회 종료 일시 — 시작일과 같거나 비어 있으면 단일 날짜로 표기한다 */
  scheduledEndAt: string | null | undefined;
  venue: string | null | undefined;
  /** 총 상금 — 문자열 값 그대로 */
  prizePool: string | null | undefined;
  prizeSummary: string | null | undefined;
};

/**
 * 대회 정보에서 홍보 카드 사실 문구를 만든다. 만들 수 없는 항목은 빈 문자열이다.
 */
export function buildTournamentPromoFactDefaults(
  source: TournamentPromoFactSource,
): Record<PromoFactKey, string> {
  return {
    dateText: formatTournamentDateRangeMedium(source.scheduledAt, source.scheduledEndAt) ?? '',
    locationText: source.venue?.trim() ?? '',
    prizeText: formatPrizeText(source.prizeSummary, source.prizePool),
  };
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
