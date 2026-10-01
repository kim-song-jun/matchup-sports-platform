export const STAR_VALUES = [1, 2, 3, 4, 5] as const;

// radiogroup 방향키 계약: 오른쪽·아래 = 다음, 왼쪽·위 = 이전(끝에서 처음으로 순환), Home·End = 양 끝.
export function nextStarValue(key: string, current: number): number | null {
  const last = STAR_VALUES.length;
  if (key === 'ArrowRight' || key === 'ArrowDown') return current === last ? 1 : current + 1;
  if (key === 'ArrowLeft' || key === 'ArrowUp') return current === 1 ? last : current - 1;
  if (key === 'Home') return 1;
  if (key === 'End') return last;
  return null;
}
