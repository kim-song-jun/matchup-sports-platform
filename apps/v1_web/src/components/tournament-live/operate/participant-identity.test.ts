import { describe, expect, it } from 'vitest';
import { rosterPersonLabel } from '@/lib/roster-presentation';
import { participantIdentityName } from './participant-identity';

/**
 * 운영 콘솔·결과 화면·어드민의 선수 이름 규칙은 이 함수 하나다. 실명은 대회 운영진에게만 내려오고
 * (`identity`), 권한이 없으면 키 자체가 없어 닉네임만 그린다 — 화면이 권한을 따로 판단하지 않는다.
 */
describe('participantIdentityName — 선수 이름 규칙 하나', () => {
  it.each([
    ['운영진 — 실명이 있으면 실명 (닉네임)', { realName: '김실명', phone: '01012345678' }, '김실명 (정우진)'],
    ['운영진 — 실명과 닉네임이 같아도 둘 다 쓴다(2026-10-18 결정)', { realName: '정우진', phone: null }, '정우진 (정우진)'],
    ['운영진 — 실명 앞뒤 공백은 지운다', { realName: ' 김실명 ', phone: null }, '김실명 (정우진)'],
    ['운영진 — 실명이 비었으면 닉네임만', { realName: '  ', phone: null }, '정우진'],
    ['운영진 — 계정 없는 참가자·탈퇴 회원(null)은 닉네임만', null, '정우진'],
    ['권한 없음 — identity 키가 없으면 닉네임만', undefined, '정우진'],
  ])('%s', (_, identity, expected) => {
    const participant = identity === undefined ? { displayNameSnapshot: '정우진' } : { displayNameSnapshot: '정우진', identity };
    expect(participantIdentityName(participant)).toBe(expected);
  });

  it.each([
    ['운영진 — 경기 명단 행에 실명이 있으면 같은 모양', { displayName: '정우진', realName: '김실명' }, '김실명 (정우진)'],
    ['운영진 — 실명과 닉네임이 같아도 둘 다', { displayName: '정우진', realName: '정우진' }, '정우진 (정우진)'],
    ['권한 없음 — realName 키가 없으면 닉네임만', { displayName: '정우진' }, '정우진'],
  ])('rosterPersonLabel 도 같은 규칙을 쓴다: %s', (_, person, expected) => {
    expect(rosterPersonLabel(person)).toBe(expected);
  });
});
