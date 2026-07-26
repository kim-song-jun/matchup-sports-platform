/**
 * 한국어 조사 선택 — 마지막 글자의 받침 유무로 [받침 있음, 받침 없음] 중 하나를 붙여 반환한다.
 * 예: josa('김민준', ['을', '를']) → '김민준을' / josa('활성커버', ['은', '는']) → '활성커버는'
 * 한글이 아닌 글자(영문·숫자 등)로 끝나면 받침 없음 쪽을 사용한다.
 */
export function josa(word: string, [withBatchim, withoutBatchim]: [string, string]): string {
  const last = word.charCodeAt(word.length - 1);
  const isHangul = last >= 0xac00 && last <= 0xd7a3;
  const hasBatchim = isHangul && (last - 0xac00) % 28 !== 0;
  return word + (hasBatchim ? withBatchim : withoutBatchim);
}
