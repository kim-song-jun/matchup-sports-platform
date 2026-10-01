import { describe, expect, it } from 'vitest';
import { displayInitials } from './display-initials';

describe('displayInitials (F54)', () => {
  it('앞의 괄호·기호·공백을 건너뛴다 — "(QA0929) 마포…" 는 "Q"', () => {
    expect(displayInitials('(QA0929) 마포 주말 리그', { fallback: '대' })).toBe('Q');
    expect(displayInitials('  [테스트] 가을 리그', { fallback: '대' })).toBe('테');
    expect(displayInitials('⚽️ 7:7 풋살', { fallback: '대' })).toBe('7');
  });

  it('여러 글자를 달라면 기호를 건너뛴 채 이어 붙이고, 서로게이트 쌍을 자르지 않는다', () => {
    expect(displayInitials('(A) 마포', { fallback: '?', count: 2 })).toBe('A마');
    expect(displayInitials('𠀋𠀋 팀', { fallback: '?', count: 1 })).toBe('𠀋');
  });

  it('글자가 하나도 없으면 대체 글자', () => {
    expect(displayInitials('()', { fallback: '대' })).toBe('대');
    expect(displayInitials(null, { fallback: '채' })).toBe('채');
  });
});

describe('displayInitials lettersOnly — 숫자가 등번호로 읽히는 자리', () => {
  it('숫자까지 건너뛰고, 글자가 없으면 대체 글자', () => {
    expect(displayInitials('(QA0929) 7번', { fallback: '?', lettersOnly: true })).toBe('Q');
    expect(displayInitials('10 김철수', { fallback: '?', lettersOnly: true })).toBe('김');
    expect(displayInitials('1004', { fallback: '?', lettersOnly: true })).toBe('?');
  });
});
