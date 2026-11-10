import { describe, expect, it } from 'vitest';
import type { V1Profile } from '@/types/api';
import { formatMissingProfileFields, getMissingRequiredProfileFields, hasBlockingMissingField } from './profile-required-fields';

const FULL: Pick<V1Profile, 'phone' | 'profile'> = {
  phone: '01011112222',
  profile: { realName: '김민준', nickname: '민준FC', gender: 'male', birthDate: '19950115' } as V1Profile['profile'],
};

describe('getMissingRequiredProfileFields', () => {
  it('모두 채워져 있으면 비어 있는 항목이 없다', () => {
    expect(getMissingRequiredProfileFields(FULL)).toEqual([]);
  });

  it('비었거나 공백뿐인 항목을 화면 순서대로 모두 돌려준다', () => {
    const data = { phone: null, profile: { ...FULL.profile, realName: '  ', gender: null, birthDate: null } } as unknown as Pick<V1Profile, 'phone' | 'profile'>;
    const missing = getMissingRequiredProfileFields(data);
    expect(missing).toEqual(['realName', 'gender', 'birthDate', 'phone']);
    expect(formatMissingProfileFields(missing)).toBe('이름, 성별, 생년월일, 휴대폰 번호');
  });
});

describe('hasBlockingMissingField', () => {
  it('서버가 거절하는 이름·닉네임·성별이 비면 막는다', () => {
    expect(hasBlockingMissingField(['realName'])).toBe(true);
    expect(hasBlockingMissingField(['birthDate', 'gender'])).toBe(true);
  });

  it('생년월일·휴대폰만 비면 막지 않고 안내만 한다', () => {
    expect(hasBlockingMissingField(['birthDate', 'phone'])).toBe(false);
    expect(hasBlockingMissingField([])).toBe(false);
  });
});
