import { endsWithFinalConsonant, withEuroRo, withWaGwa } from './korean-josa';

describe('withWaGwa', () => {
  it.each([
    ['QA0929 합정 유나이티드', '와'], // 드 — 받침 없음
    ['마포 강남', '과'], // 남 — ㅁ 받침
    ['한강 FC', '와'], // 씨
    ['FC Seoul', '과'], // 서울
    ['Blue Star', '와'], // 스타 — r 로 끝나도 받침 없음
    ['망원 L', '과'], // 엘
    ['QA0929', '와'], // 구
    ['팀 3', '과'], // 삼
    ['FC 서울(U18)', '과'], // 괄호는 건너뛰고 십팔
    ['서울 유나이티드 FC!', '와'], // 느낌표는 건너뛴다
  ])('%s 뒤에는 %s', (name, josa) => {
    expect(withWaGwa(name)).toBe(`${name}${josa}`);
  });

  it('읽을 글자가 하나도 없으면 받침 없음으로 본다', () => {
    expect(endsWithFinalConsonant('!!!')).toBe(false);
    expect(endsWithFinalConsonant('')).toBe(false);
  });
});

describe('withEuroRo', () => {
  it.each([
    ['퇴장 1회', '로'], // 회 — 받침 없음
    ['경고 2장 누적', '으로'], // 적 — ㄱ 받침
    ['서울', '로'], // ㄹ 받침은 "로"
    ['마포 강남', '으로'], // 남 — ㅁ 받침
    ['QA0929', '로'], // 구
    ['팀 3', '으로'], // 삼
    ['팀 7', '로'], // 칠 — ㄹ 받침
    ['망원 L', '로'], // 엘 — ㄹ 받침
    ['FC 서울(U18)', '로'], // 십팔 — ㄹ 받침
    ['!!!', '로'], // 읽을 글자가 없으면 받침 없음
  ])('%s 뒤에는 %s', (word, josa) => {
    expect(withEuroRo(word)).toBe(`${word}${josa}`);
  });
});
