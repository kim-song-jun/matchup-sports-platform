/**
 * 숫자 0~9의 한국어 발음 기준 받침 유무. "레드2"(→ "이", 받침 없음)처럼 숫자로 끝나는
 * 이름·라벨에 조사를 붙일 때 사용한다. 예: 0=영/공(받침 있음), 1=일(받침 있음),
 * 2=이(받침 없음), 3=삼(받침 있음), 6=육(받침 있음), 9=구(받침 없음).
 */
const DIGIT_HAS_BATCHIM: Readonly<Record<string, boolean>> = {
  '0': true,
  '1': true,
  '2': false,
  '3': true,
  '4': false,
  '5': false,
  '6': true,
  '7': true,
  '8': true,
  '9': false,
};

/**
 * 한국어 조사 선택 — 마지막 글자의 받침 유무로 [받침 있음, 받침 없음] 중 하나를 붙여 반환한다.
 * 예: josa('김민준', ['을', '를']) → '김민준을' / josa('활성커버', ['은', '는']) → '활성커버는'
 * 숫자로 끝나면 그 숫자의 한국어 발음 받침으로 판정한다(예: josa('레드2', ['을','를']) → '레드2를',
 * josa('레드1', ['을','를']) → '레드1을'). 그 외 한글이 아닌 글자(영문 등)로 끝나면 받침 없음 쪽을 사용한다.
 */
export function josa(word: string, [withBatchim, withoutBatchim]: [string, string]): string {
  const lastChar = word[word.length - 1] ?? '';
  const last = word.charCodeAt(word.length - 1);
  const isHangul = last >= 0xac00 && last <= 0xd7a3;
  const hasBatchim = isHangul
    ? (last - 0xac00) % 28 !== 0
    : (DIGIT_HAS_BATCHIM[lastChar] ?? false);
  return word + (hasBatchim ? withBatchim : withoutBatchim);
}
