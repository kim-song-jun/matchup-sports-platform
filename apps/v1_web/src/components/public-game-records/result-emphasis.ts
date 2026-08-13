import type { CSSProperties } from 'react';

/**
 * 전적 화면(팀·개인 공용)의 승/무/패 강조.
 *
 * 이전엔 두 화면이 각자 `RESULT_COLOR` 맵을 들고 12~14px 글자 한 자의 색만 바꿨다 — 목록을
 * 훑을 때 승패가 사실상 구분되지 않았고, 개인 전적 쪽은 다크모드에서 대비가 미달인 500계열을
 * 쓰고 있어 두 화면의 톤도 어긋나 있었다. 칩 배경 + 행 좌측 색 띠로 승격하면서 정의를 여기로
 * 합친다.
 *
 * 색 선택 근거:
 * - 텍스트/배경 쌍은 `-700` + `-50` 조합만 쓴다. `globals.css` 다크 섹션 주석의 실측대로
 *   500계열은 자기 틴트 배경 위에서 3.7:1로 AA 미달이고, 700계열은 라이트/다크 각각 카드
 *   표면과 틴트 배경 양쪽에 4.5:1 이상을 확보하도록 토큰이 재정의돼 있다.
 * - 무승부 칩 배경은 `--grey100`이 아니라 `--surface-soft`다. 다크에서 `--grey100`은 카드
 *   표면과 같은 값(#1c1e24)이라 칩이 통째로 사라진다.
 * - 색만으로 정보를 전달하지 않는다(WCAG 1.4.1) — 칩 안의 '승/무/패' 글자가 항상 함께 렌더되고,
 *   좌측 띠는 그 글자를 보조하는 스캔 힌트일 뿐 단독으로 의미를 지지 않는다.
 */
const CHIP_TONE: Record<string, { color: string; background: string }> = {
  WON: { color: 'var(--blue700)', background: 'var(--blue50)' },
  DRAWN: { color: 'var(--text-caption)', background: 'var(--surface-soft)' },
  LOST: { color: 'var(--red700)', background: 'var(--red50)' },
};

/** 결과를 특정할 수 없는 행(개인 전적의 `result: null` — 스코어 사이드 매칭 실패) 용 중립 톤. */
const NEUTRAL_TONE = { color: 'var(--text-caption)', background: 'var(--surface-soft)' };

const STRIPE_COLOR: Record<string, string> = {
  WON: 'var(--blue500)',
  DRAWN: 'var(--grey300)',
  LOST: 'var(--red500)',
};

/** 결과 라벨('승'/'무'/'패'/'-')을 감싸는 칩 스타일. */
export function resultChipStyle(result: string | null): CSSProperties {
  const tone = (result ? CHIP_TONE[result] : undefined) ?? NEUTRAL_TONE;
  return {
    ...tone,
    fontSize: 12,
    fontWeight: 800,
    lineHeight: '18px',
    borderRadius: 6,
    padding: '2px 8px',
    flexShrink: 0,
  };
}

/**
 * 기록 행 좌측의 결과 색 띠. 4px 띠가 들어간 만큼 좌측 패딩에서 4px을 돌려줘야 기존 16px
 * 콘텐츠 정렬이 유지되므로, 호출부는 `paddingLeft: 12`와 함께 쓴다.
 */
export function resultStripeStyle(result: string | null): CSSProperties {
  const color = (result ? STRIPE_COLOR[result] : undefined) ?? 'transparent';
  return { borderLeft: `4px solid ${color}` };
}
