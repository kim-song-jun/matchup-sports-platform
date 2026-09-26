import { expect } from 'vitest';

/** 대회 경기 설정은 축구·풋살만 된다. 한 문장 안에서 대회와 러닝·수영을 함께 약속하지 않는다. */
export function expectNoNonFootballCompetitionClaim(text: string): void {
  for (const sentence of text.split('.')) {
    if (!/대회/.test(sentence)) continue;
    expect(sentence, sentence).not.toMatch(/러닝|수영/);
  }
}
