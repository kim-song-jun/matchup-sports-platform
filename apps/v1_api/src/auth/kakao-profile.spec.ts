import {
  buildKakaoSignupPrefill,
  normalizeKakaoGender,
  normalizeKakaoName,
  normalizeKakaoPhone,
  normalizeKakaoBirthDate,
  readKakaoSignupPrefill,
  withoutSocialPrefill,
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
      birthDate: null,
    });
  });
});

describe('readKakaoSignupPrefill', () => {
  it('draftJson 에 저장된 카카오 값을 읽어온다', () => {
    expect(
      readKakaoSignupPrefill({
        kakaoName: '홍길동',
        kakaoPhone: '01012345678',
        kakaoGender: 'male',
      }),
    ).toEqual({ name: '홍길동', phone: '01012345678', gender: 'male', birthDate: null });
  });

  it('draftJson 이 없거나 형태가 다르면 null 이다', () => {
    expect(readKakaoSignupPrefill(null)).toBeNull();
    expect(readKakaoSignupPrefill('nope')).toBeNull();
    expect(readKakaoSignupPrefill([1, 2])).toBeNull();
    // 제공자 값이 없는 draft(예: 가입을 끝내 값을 지운 뒤)는 프리필이 없는 것으로 읽는다.
    expect(readKakaoSignupPrefill({ ageConfirmedAt: '2026-10-11T00:00:00.000Z', autoNickname: '씩씩한수달3' })).toBeNull();
  });
});

describe('withoutSocialPrefill', () => {
  const rest = { ageConfirmedAt: '2026-10-11T00:00:00.000Z', autoNickname: '씩씩한수달3', currentStep: 'sport' };

  it('removes every provider value the form reads and keeps the other draft keys', () => {
    const draft = {
      ...rest,
      kakaoName: '홍길동',
      kakaoPhone: '01012345678',
      kakaoGender: null,
      kakaoBirthDate: '20000229',
      appleName: '김애플',
    };
    expect(readKakaoSignupPrefill(draft)).not.toBeNull();

    const stripped = withoutSocialPrefill(draft);

    expect(stripped).toEqual(rest);
    expect(readKakaoSignupPrefill(stripped)).toBeNull();
  });

  it('does not mutate the draft it was given', () => {
    const draft = { ...rest, kakaoName: '홍길동' };
    withoutSocialPrefill(draft);
    expect(draft).toEqual({ ...rest, kakaoName: '홍길동' });
  });

  it('returns the other keys untouched when no provider value is present', () => {
    expect(withoutSocialPrefill(rest)).toEqual(rest);
  });

  it.each([null, undefined, 'draft', [1, 2]])('yields an empty draft for the non-object %p', (draft) => {
    expect(withoutSocialPrefill(draft)).toEqual({});
  });
});

describe('Kakao birth date', () => {
  it('combines a complete Gregorian birthday and year without collecting age_range', () => {
    expect(normalizeKakaoBirthDate('2000', '0229', 'SOLAR')).toBe('20000229');
    expect(readKakaoSignupPrefill({ kakaoBirthDate: '20000229' })?.birthDate).toBe('20000229');
  });
  it.each([
    ['2001', '0229', 'SOLAR'], ['2000', '0229', 'LUNAR'],
    [undefined, '0101', 'SOLAR'], ['2000', undefined, 'SOLAR'], ['2000', '0101', undefined],
  ])('does not invent a date from %s/%s/%s', (year, birthday, type) => {
    expect(normalizeKakaoBirthDate(year, birthday, type)).toBeNull();
  });
});
