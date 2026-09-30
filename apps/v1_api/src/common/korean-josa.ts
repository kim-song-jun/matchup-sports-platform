const HANGUL_FIRST = 0xac00;
const HANGUL_LAST = 0xd7a3;
/** 완성형 한글은 (초성 × 21 + 중성) × 28 + 종성 순으로 놓여 있고, 종성 0 이 받침 없음이다. */
const FINAL_CONSONANT_CYCLE = 28;
/**
 * 영문으로 끝나면 읽는 소리의 받침으로 판정한다 — 끝 글자가 l·m·n 이면 받침이 남는다(Seoul·Team·Dragon).
 * r 은 넣지 않는다: 팀 이름의 -r 은 대개 받침 없이 읽힌다(Star 스타, Tiger 타이거).
 */
const LATIN_WITH_FINAL = new Set(['L', 'M', 'N']);
/** 숫자는 한자어로 읽는다 — 영·일·삼·육·칠·팔은 받침이 있다(웹 `lib/korean.ts` 와 같은 표). */
const DIGIT_WITH_FINAL = new Set(['0', '1', '3', '6', '7', '8']);
const READABLE_CHARACTER = /[가-힣A-Za-z0-9]/u;

/**
 * 마지막으로 읽히는 글자에 받침이 있는가. 뒤에 붙은 괄호·기호는 읽히지 않으므로 건너뛴다
 * ("FC 서울(U18)" 은 십팔의 ㄹ 로 판정한다). 읽을 글자가 하나도 없으면 받침 없음이다.
 */
export function endsWithFinalConsonant(word: string): boolean {
  const characters = Array.from(word);
  for (let index = characters.length - 1; index >= 0; index -= 1) {
    const character = characters[index];
    if (!READABLE_CHARACTER.test(character)) continue;
    const code = character.codePointAt(0) ?? 0;
    if (code >= HANGUL_FIRST && code <= HANGUL_LAST) {
      return (code - HANGUL_FIRST) % FINAL_CONSONANT_CYCLE !== 0;
    }
    return LATIN_WITH_FINAL.has(character.toUpperCase()) || DIGIT_WITH_FINAL.has(character);
  }
  return false;
}

/** 이름 뒤에 와/과를 붙인다. */
export function withWaGwa(word: string): string {
  return `${word}${endsWithFinalConsonant(word) ? '과' : '와'}`;
}
