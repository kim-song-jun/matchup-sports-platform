/**
 * 아바타 자리에 쓰는 표시 이니셜 — 이름에서 글자·숫자만 앞에서부터 `count` 개(F54).
 * "(QA0929) 마포 주말 리그" 가 "(" 로 보였다. 이모지·확장 한자를 반으로 자르지 않게 code point 로 센다.
 */
export function displayInitials(name: string | null | undefined, options: { fallback: string; count?: number }): string {
  const letters = Array.from(name ?? '').filter((char) => /[\p{L}\p{N}]/u.test(char));
  return letters.slice(0, options.count ?? 1).join('') || options.fallback;
}
