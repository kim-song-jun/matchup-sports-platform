import {
  ACCOUNT_PASSWORD_MIN_LENGTH,
  COMMON_PASSWORDS,
  accountPasswordIssue,
  isCommonPassword,
} from './account-password-rules';

describe('COMMON_PASSWORDS', () => {
  // A list that breaks these shapes silently stops matching: an uppercase entry can never equal a lowercased
  // input, and a short entry is already refused by the length rule.
  it('holds only lowercase entries at least as long as the minimum, without duplicates', () => {
    const uppercase = COMMON_PASSWORDS.filter((entry) => entry !== entry.toLowerCase());
    const tooShort = COMMON_PASSWORDS.filter((entry) => entry.length < ACCOUNT_PASSWORD_MIN_LENGTH);
    const duplicates = COMMON_PASSWORDS.filter((entry, index) => COMMON_PASSWORDS.indexOf(entry) !== index);

    expect({ uppercase, tooShort, duplicates }).toEqual({ uppercase: [], tooShort: [], duplicates: [] });
  });
});

describe('isCommonPassword', () => {
  it.each(['password123', 'qwer1234', '1q2w3e4r', 'qlalfqjsgh', '12345678', '19900101', '01012345678'])(
    'blocks %s',
    (password) => {
      expect(isCommonPassword(password)).toBe(true);
    },
  );

  it.each(['Password123', 'QWER1234', '1Q2W3E4R', 'PassWord!'])('ignores case: %s', (password) => {
    expect(isCommonPassword(password)).toBe(true);
  });

  // The list is matched whole. Blocking anything that merely contains a listed word would refuse good passphrases.
  it.each(['password123x', 'my-password123', 'Sunny-ride-4', 'correct horse battery staple'])(
    'lets %s through',
    (password) => {
      expect(isCommonPassword(password)).toBe(false);
    },
  );
});

describe('accountPasswordIssue', () => {
  it('reports a password shorter than the minimum as too short', () => {
    expect(accountPasswordIssue('1234567')).toBe('too_short');
    expect(accountPasswordIssue('')).toBe('too_short');
  });

  it('reports a listed password at least as long as the minimum as too common', () => {
    expect(accountPasswordIssue('12345678')).toBe('too_common');
    expect(accountPasswordIssue('Qwer1234')).toBe('too_common');
  });

  it('accepts everything else, including one of exactly the minimum length', () => {
    expect(accountPasswordIssue('exactly8')).toBeNull();
    expect(accountPasswordIssue('Sunny-ride-4')).toBeNull();
  });

  // The server validator counts an astral character (emoji) as one; String.length counts two.
  it.each([
    ['four emoji, eight UTF-16 units', '😀😀😀😀', 'too_short'],
    ['seven emoji', '😀😀😀😀😀😀😀', 'too_short'],
    ['eight emoji, sixteen UTF-16 units', '😀😀😀😀😀😀😀😀', null],
    ['two letters and six emoji', 'ab😀😀😀😀😀😀', null],
  ] as const)('counts characters, not UTF-16 units: %s', (_label, password, expected) => {
    expect(accountPasswordIssue(password)).toBe(expected);
  });
});
