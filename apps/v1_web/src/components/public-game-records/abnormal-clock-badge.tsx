'use client';

/**
 * alpha "452′" 사고 대응(2026-08) -- `isClockAbnormal`(`./format.ts`)이
 * true인 경기 시각 옆에만 붙는 경고 표식. 숫자 자체(`formatGoalMinute`/
 * `formatClock`이 만든 텍스트)는 절대 바꾸거나 숨기지 않고, 그 옆에 "이
 * 값은 이상해요"만 덧붙인다 -- 서버가 그 값을 하드 거부하지 않기로 한 이상
 * (`apps/v1_api/.../game-invariants.ts` 참고), 이미 기록된 값을 조작하는
 * 대신 정직하게 신호만 더하는 게 이 화면의 유일한 책임이다.
 *
 * `title`은 마우스 사용자용 툴팁, `aria-label`은 스크린리더용 -- 이
 * 컴포넌트 트리가 이미 "⚽" 같은 이모지를 `aria-hidden`으로 쓰는 관례와
 * 짝을 맞춰, 여기서는 표식 자체가 곧 유일한 정보라 `aria-hidden`을 쓰지
 * 않는다.
 */
export function AbnormalClockBadge() {
  return (
    <span
      title="비정상적으로 긴 경기 시각이에요. 확인이 필요해요."
      aria-label="비정상적으로 긴 경기 시각이에요. 확인이 필요해요."
      style={{ color: 'var(--orange700)', marginLeft: 2 }}
    >
      ⚠
    </span>
  );
}
