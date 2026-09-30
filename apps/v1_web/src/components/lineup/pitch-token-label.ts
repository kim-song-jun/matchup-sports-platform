/**
 * 코트 위 선수 표기 규칙(Task 180 H7 · N-1). 44px 토큰과 그 아래 이름표에 들어갈 글자를 정한다.
 *
 * 1. 원 안에는 등번호 — 번호는 호출부가 팀 등번호로 채워 준다.
 * 2. 번호가 없으면 줄인 이름의 첫 글자(원은 점선) — 숫자로 오해하지 않게 글자를 쓴다.
 * 3. 이름표는 5자까지, 넘으면 앞 4자 + "…".
 * 4. 보드 전원이 같은 앞부분("QA0929선수01"·"QA0929팀장1" 의 "QA0929")은 뗀다.
 * 5. 골키퍼 표기(주황 원 + GK 글자)는 토큰 컴포넌트가 한다.
 *
 * 글자 수는 코드 유닛이 아니라 문자(`Array.from`)로 센다 — 이모지·결합 문자에서 반쪽이 남지 않게.
 */

const MIN_SHARED_PREFIX = 3;
const MIN_REMAINDER = 2;
const TOKEN_NAME_MAX = 5;

type CharClass = 'space' | 'hangul' | 'latin' | 'digit' | 'other';

function charClass(ch: string): CharClass {
  if (/\s/.test(ch)) return 'space';
  if (/[\u1100-\u11ff\u3130-\u318f\uac00-\ud7a3]/.test(ch)) return 'hangul';
  if (/[A-Za-z]/.test(ch)) return 'latin';
  if (/[0-9]/.test(ch)) return 'digit';
  return 'other';
}

/**
 * 보드 전원이 공유하는 앞부분 중 뗄 길이(문자 수). 뗄 수 없으면 0.
 *
 * 규칙 4의 조건(3자 이상 같고, 모두 뒤에 2자 이상 남는다)에 더해 **글자 종류가 바뀌는 자리**
 * (숫자→한글, 공백→글자)에서만 자른다 — 공통부분 끝에서 바로 자르면 "E2E 알파 A팀 선수1·2" 가
 * "수1·수2" 가 된다. 이름이 한 종류뿐이면(한 명이거나 전원 동명) 떼지 않는다.
 */
export function sharedNamePrefixLength(names: readonly string[]): number {
  const unique = [...new Set(names)].map((name) => Array.from(name));
  if (unique.length < 2) return 0;

  let common = 0;
  const shortest = Math.min(...unique.map((chars) => chars.length));
  while (common < shortest && unique.every((chars) => chars[common] === unique[0][common])) common += 1;

  for (let cut = Math.min(common, shortest - MIN_REMAINDER); cut >= MIN_SHARED_PREFIX; cut -= 1) {
    const atBoundary = unique.every((chars) => charClass(chars[cut - 1]) !== charClass(chars[cut]));
    if (atBoundary) return cut;
  }
  return 0;
}

/** 공통 앞부분을 뗀 이름. 대기 칩은 이 값을 그대로(5자 제한 없이) 쓴다. */
export function stripSharedPrefix(name: string, prefixLength: number): string {
  if (prefixLength === 0) return name;
  const rest = Array.from(name).slice(prefixLength).join('').trimStart();
  return rest === '' ? name : rest;
}

/** 토큰 아래 이름표 — 규칙 3·4. */
export function tokenNameLabel(name: string, prefixLength: number): string {
  const chars = Array.from(stripSharedPrefix(name, prefixLength));
  return chars.length <= TOKEN_NAME_MAX ? chars.join('') : `${chars.slice(0, TOKEN_NAME_MAX - 1).join('')}…`;
}

/** 번호 없는 토큰의 원 안 글자 — 규칙 2. 이름이 비어 있으면 물음표. */
export function tokenInitial(name: string, prefixLength: number): string {
  return Array.from(stripSharedPrefix(name, prefixLength))[0] ?? '?';
}
