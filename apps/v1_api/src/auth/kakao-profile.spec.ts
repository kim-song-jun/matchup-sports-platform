import {
  buildKakaoSignupPrefill,
  normalizeKakaoGender,
  normalizeKakaoName,
  normalizeKakaoPhone,
  readKakaoSignupPrefill,
} from './kakao-profile';

describe('normalizeKakaoPhone', () => {
  it('국제 표기 국내 번호를 11자리 국내 형식으로 바꾼다', () => {
    expect(normalizeKakaoPhone('+82 10-1234-5678')).toBe('01012345678');
    expect(normalizeKakaoPhone('+821012345678')).toBe('01012345678');
    expect(normalizeKakaoPhone('010-1234-5678')).toBe('01012345678');
    expect(normalizeKakaoPhone('01012345678')).toBe('01012345678');
  });

  // 잘못된 값을 채우면 사용자가 지우고 다시 입력해야 하므로, 변환 불가한 값은 채우지 않는다.
  it('국내 휴대폰으로 변환할 수 없으면 null 이다', () => {
    expect(normalizeKakaoPhone('+1 415-555-0199')).toBeNull();
    expect(normalizeKakaoPhone('+82 2-123-4567')).toBeNull();
    expect(normalizeKakaoPhone('')).toBeNull();
    expect(normalizeKakaoPhone(null)).toBeNull();
    expect(normalizeKakaoPhone(undefined)).toBeNull();
  });
});

describe('normalizeKakaoGender', () => {
  it('male/female 만 통과시킨다', () => {
    expect(normalizeKakaoGender('male')).toBe('male');
    expect(normalizeKakaoGender('female')).toBe('female');
    expect(normalizeKakaoGender('other')).toBeNull();
    expect(normalizeKakaoGender(undefined)).toBeNull();
  });
});

describe('normalizeKakaoName', () => {
  it('공백만 있는 이름은 null 이다', () => {
    expect(normalizeKakaoName('  홍길동 ')).toBe('홍길동');
    expect(normalizeKakaoName('   ')).toBeNull();
    expect(normalizeKakaoName(null)).toBeNull();
  });
});

describe('buildKakaoSignupPrefill', () => {
  // 동의항목 미승인 상태에서는 세 필드가 통째로 없다 — 이때 빈 객체를 저장하지 않는다.
  it('쓸 수 있는 값이 하나도 없으면 null 이다', () => {
    expect(buildKakaoSignupPrefill({})).toBeNull();
    expect(buildKakaoSignupPrefill({ name: '  ', phone: '+1 415-555-0199', gender: 'other' })).toBeNull();
  });

  it('일부만 있어도 그 값만 담아 돌려준다', () => {
    expect(buildKakaoSignupPrefill({ gender: 'female' })).toEqual({
      name: null,
      phone: null,
      gender: 'female',
    });
  });
});

describe('readKakaoSignupPrefill', () => {
  it('draftJson 에 저장된 카카오 값을 읽어온다', () => {
    expect(
      readKakaoSignupPrefill({
        kakaoProfileImageUrl: 'https://img.example/a.png',
        kakaoName: '홍길동',
        kakaoPhone: '01012345678',
        kakaoGender: 'male',
      }),
    ).toEqual({ name: '홍길동', phone: '01012345678', gender: 'male' });
  });

  it('draftJson 이 없거나 형태가 다르면 null 이다', () => {
    expect(readKakaoSignupPrefill(null)).toBeNull();
    expect(readKakaoSignupPrefill('nope')).toBeNull();
    expect(readKakaoSignupPrefill([1, 2])).toBeNull();
    // 이미지 URL 만 있던 기존 가입 건(이 기능 이전 데이터)도 안전하게 null.
    expect(readKakaoSignupPrefill({ kakaoProfileImageUrl: 'https://img.example/a.png' })).toBeNull();
  });
});
