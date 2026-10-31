import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { LinkEmailCompleteDto, LinkEmailRequestDto, LinkEmailVerifyDto } from './link-email.dto';
import { RegisterDto } from './register.dto';

const TOKEN = 't'.repeat(40);

async function failedProperties<T extends object>(cls: new () => T, input: Record<string, unknown>) {
  const errors = await validate(plainToInstance(cls, input));
  return errors.map((error) => error.property);
}

describe('LinkEmailRequestDto', () => {
  it('accepts an address and refuses one that is not or is too long', async () => {
    expect(await failedProperties(LinkEmailRequestDto, { email: 'runner@example.com' })).toEqual([]);
    expect(await failedProperties(LinkEmailRequestDto, { email: 'not-an-email' })).toEqual(['email']);
    expect(await failedProperties(LinkEmailRequestDto, { email: `${'a'.repeat(250)}@example.com` })).toEqual(['email']);
    expect(await failedProperties(LinkEmailRequestDto, {})).toEqual(['email']);
  });
});

describe('LinkEmailVerifyDto', () => {
  it.each(['12345', '1234567', '12345a', ' 123456'])('refuses the code %p', async (code) => {
    expect(await failedProperties(LinkEmailVerifyDto, { code })).toEqual(['code']);
  });

  it('accepts six digits', async () => {
    expect(await failedProperties(LinkEmailVerifyDto, { code: '012345' })).toEqual([]);
  });
});

describe('LinkEmailCompleteDto', () => {
  const valid = { emailLinkToken: TOKEN, password: 'password123', passwordConfirm: 'password123' };

  it('accepts a matching password pair of eight or more characters', async () => {
    expect(await failedProperties(LinkEmailCompleteDto, valid)).toEqual([]);
  });

  it('refuses a confirmation that differs, including by case or a trailing space', async () => {
    expect(await failedProperties(LinkEmailCompleteDto, { ...valid, passwordConfirm: 'password124' })).toEqual(['passwordConfirm']);
    expect(await failedProperties(LinkEmailCompleteDto, { ...valid, passwordConfirm: 'Password123' })).toEqual(['passwordConfirm']);
    expect(await failedProperties(LinkEmailCompleteDto, { ...valid, passwordConfirm: 'password123 ' })).toEqual(['passwordConfirm']);
    expect(await failedProperties(LinkEmailCompleteDto, { ...valid, passwordConfirm: undefined })).toEqual(['passwordConfirm']);
  });

  it('applies the signup password rule: eight characters at least, a string', async () => {
    expect(await failedProperties(LinkEmailCompleteDto, { ...valid, password: 'short12', passwordConfirm: 'short12' })).toEqual(['password']);
    expect(await failedProperties(LinkEmailCompleteDto, { ...valid, password: 12345678, passwordConfirm: 12345678 })).toEqual(
      expect.arrayContaining(['password']),
    );
    // Same rule as signup, in both directions: what signup refuses is refused here, what it takes is taken.
    const signup = { nickname: '민수', email: 'a@example.com', requiredTermsAccepted: true, acceptedTermsDocumentIds: ['11111111-1111-4111-8111-111111111111'], displayName: '민수', phone: '01012345678', birthDate: '20000101', gender: 'male' };
    expect(await failedProperties(RegisterDto, { ...signup, password: 'short12' })).toEqual(['password']);
    expect(await failedProperties(RegisterDto, { ...signup, password: 'exactly8' })).toEqual([]);
    expect(await failedProperties(LinkEmailCompleteDto, { ...valid, password: 'exactly8', passwordConfirm: 'exactly8' })).toEqual([]);
  });

  it.each(['short', 'x'.repeat(2049)])('refuses a token that cannot be one (%#)', async (emailLinkToken) => {
    expect(await failedProperties(LinkEmailCompleteDto, { ...valid, emailLinkToken })).toEqual(['emailLinkToken']);
  });
});
