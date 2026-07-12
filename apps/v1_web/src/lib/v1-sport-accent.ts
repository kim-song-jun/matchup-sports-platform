/**
 * v1-sport-accent.ts
 *
 * Maps v1 sport codes to display metadata (Korean label + design-token colors).
 *
 * Color strategy — 노출 종목은 서로 구분, 나머지는 카테고리 유지 (무지개 지양):
 *   - soccer   → green  (필드/잔디)
 *   - futsal   → blue   (브랜드 액센트 / 실내 코트)
 *   - running  → orange (에너지)
 *   - swimming → teal   (물)
 *   - 그 외 시드되지 않은 종목 → 카테고리 컬러 (ball=blue/orange, endurance=green)
 *   - Unknown / fallback → grey
 *
 * All color values reference CSS custom properties defined in globals.css so they
 * respond to any theme overrides.  Do NOT add hardcoded hex values here.
 */

export interface SportAccent {
  /** 한국어 종목명 */
  label: string;
  /** CSS var color for the sport indicator dot */
  dot: string;
  /** CSS var color for badge background */
  badgeBg: string;
  /** CSS var color for badge text */
  badgeText: string;
}

/** Accent map keyed by v1 sport code (lower-case, matches DB `v1Sport.code`). */
const SPORT_ACCENT_MAP: Record<string, SportAccent> = {
  // ── 노출 종목 (서로 구분되는 고유 컬러) ──────────────────────────────
  soccer: {
    label: '축구',
    dot: 'var(--green500)',
    badgeBg: 'var(--green50)',
    badgeText: 'var(--green500)',
  },
  futsal: {
    label: '풋살',
    dot: 'var(--blue500)',
    badgeBg: 'var(--blue50)',
    badgeText: 'var(--blue500)',
  },
  running: {
    label: '러닝',
    dot: 'var(--orange500)',
    badgeBg: 'var(--orange50)',
    badgeText: 'var(--orange500)',
  },
  swimming: {
    label: '수영',
    dot: 'var(--teal500)',
    badgeBg: 'var(--teal50)',
    badgeText: 'var(--teal500)',
  },
  // ── Additional codes that may appear if new sports are seeded ──────────
  basketball: {
    label: '농구',
    dot: 'var(--orange500)',
    badgeBg: 'var(--orange50)',
    badgeText: 'var(--orange500)',
  },
  badminton: {
    label: '배드민턴',
    dot: 'var(--green500)',
    badgeBg: 'var(--green50)',
    badgeText: 'var(--green500)',
  },
  tennis: {
    label: '테니스',
    dot: 'var(--green500)',
    badgeBg: 'var(--green50)',
    badgeText: 'var(--green500)',
  },
  baseball: {
    label: '야구',
    dot: 'var(--orange500)',
    badgeBg: 'var(--orange50)',
    badgeText: 'var(--orange500)',
  },
  volleyball: {
    label: '배구',
    dot: 'var(--blue500)',
    badgeBg: 'var(--blue50)',
    badgeText: 'var(--blue500)',
  },
  cycling: {
    label: '사이클',
    dot: 'var(--green500)',
    badgeBg: 'var(--green50)',
    badgeText: 'var(--green500)',
  },
  golf: {
    label: '골프',
    dot: 'var(--green500)',
    badgeBg: 'var(--green50)',
    badgeText: 'var(--green500)',
  },
};

/** Neutral grey fallback for unknown/future codes. */
const FALLBACK_ACCENT: SportAccent = {
  label: '기타',
  dot: 'var(--grey400)',
  badgeBg: 'var(--grey100)',
  badgeText: 'var(--grey600)',
};

/**
 * Returns display accent for the given v1 sport code.
 * Falls back to a neutral grey accent for unrecognised codes.
 *
 * @example
 * const { label, badgeBg, badgeText } = getSportAccent('futsal');
 * // → { label: '풋살', badgeBg: 'var(--blue50)', badgeText: 'var(--blue500)', dot: 'var(--blue500)' }
 */
export function getSportAccent(code: string): SportAccent {
  return SPORT_ACCENT_MAP[code] ?? FALLBACK_ACCENT;
}
