import { describe, expect, it } from 'vitest';
import { maskContactNumbers } from './public-text';

const MASK = '***-****-****';

describe('maskContactNumbers', () => {
  it.each([
    ['하이픈', '010-1234-5678'],
    ['공백', '010 1234 5678'],
    ['하이픈 앞뒤 공백', '010 - 1234 - 5678'],
    ['점', '010.1234.5678'],
    ['붙여 쓴 꼴', '01012345678'],
    ['3-3-4 자리 휴대전화', '011-123-4567'],
    ['국가번호 +82', '+82 10-1234-5678'],
    ['국가번호 +82 와 괄호 0', '+82 (0)10-1234-5678'],
    ['서울 지역번호', '02-123-4567'],
    ['지방 지역번호', '031-1234-5678'],
    ['괄호 지역번호', '(02) 1234-5678'],
    ['인터넷전화', '070-1234-5678'],
  ])('%s 꼴 번호 전체를 한 가지 표기로 가린다', (_label, number) => {
    expect(maskContactNumbers(number)).toBe(MASK);
  });

  it('문장 속 번호만 가리고 앞뒤 글자와 문장부호는 남긴다', () => {
    expect(maskContactNumbers('문의는 010-1234-5678.')).toBe(`문의는 ${MASK}.`);
    expect(maskContactNumbers('총무 010-1234-5678 / 부총무 010 9876 5432 입니다')).toBe(`총무 ${MASK} / 부총무 ${MASK} 입니다`);
  });

  it('번호가 아닌 숫자는 건드리지 않는다', () => {
    const untouched = [
      '2026-11-13 19:00~21:00 경기',
      '2026.11.13(금) 오후 7시 킥오프',
      '2026-02-03~2026-02-10 접수',
      '11월 02일 02:00~04:00 점검',
      '참가비 10,000원 · 총상금 1,500,000원',
      '결과 3-2 승리, 지난 경기는 10-0',
      '등번호 10번 · 07번 · 011번 선수',
      '0927',
      '20261113',
      '010-1234',
      '0101234567890',
      '계좌 1002-123-456789',
    ];
    for (const text of untouched) expect(maskContactNumbers(text)).toBe(text);
  });

  it('긴 숫자열 안에 우연히 든 번호 꼴은 가리지 않는다', () => {
    expect(maskContactNumbers('주문 20101234567890')).toBe('주문 20101234567890');
  });

  it('값이 없으면 빈 문자열을 돌려준다', () => {
    expect(maskContactNumbers(null)).toBe('');
    expect(maskContactNumbers(undefined)).toBe('');
  });
});
