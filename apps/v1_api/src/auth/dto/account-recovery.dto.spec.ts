import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { FindAccountDto, ResetPasswordByEmailDto, ResetPasswordDto } from './account-recovery.dto';

async function failedProperties(cls: new () => object, input: Record<string, unknown>) {
  const errors = await validate(plainToInstance(cls, input));
  return errors.map((error) => error.property);
}

describe('FindAccountDto', () => {
  const base = { phone: '01012345678', proofToken: 'phone-proof' };
  const mailbox = { email: 'runner@example.com', emailProofToken: 'email-proof' };

  it('accepts the phone proof alone and the phone proof with a mailbox proof', async () => {
    expect(await failedProperties(FindAccountDto, base)).toEqual([]);
    expect(await failedProperties(FindAccountDto, { ...base, ...mailbox })).toEqual([]);
  });

  // A half-sent proof is a client bug, not "no proof" — answering it as the plain lookup would hide the bug.
  it('refuses one half of the mailbox proof without the other', async () => {
    expect(await failedProperties(FindAccountDto, { ...base, email: mailbox.email })).toEqual(['emailProofToken']);
    expect(await failedProperties(FindAccountDto, { ...base, emailProofToken: mailbox.emailProofToken })).toEqual(['email']);
  });

  it.each([
    ['an address that is not one', { ...mailbox, email: 'not-an-email' }, 'email'],
    ['an address over 254 characters', { ...mailbox, email: `${'a'.repeat(250)}@example.com` }, 'email'],
    ['a null address', { ...mailbox, email: null }, 'email'],
    ['a proof over 2048 characters', { ...mailbox, emailProofToken: 'x'.repeat(2049) }, 'emailProofToken'],
    ['a non-string proof', { ...mailbox, emailProofToken: 123 }, 'emailProofToken'],
  ])('refuses %s', async (_label, extra, property) => {
    expect(await failedProperties(FindAccountDto, { ...base, ...extra })).toEqual([property]);
  });
});

describe.each([
  ['ResetPasswordDto (phone)', ResetPasswordDto, { phone: '01012345678', proofToken: 'proof' }],
  ['ResetPasswordByEmailDto', ResetPasswordByEmailDto, { email: 'runner@example.com', proofToken: 'proof' }],
] as const)('%s password rule', (_name, cls, base) => {
  it('takes a password of eight or more characters that is not common', async () => {
    expect(await failedProperties(cls, { ...base, newPassword: 'Sunny-ride-4' })).toEqual([]);
    expect(await failedProperties(cls, { ...base, newPassword: 'exactly8' })).toEqual([]);
  });

  it.each(['short12', 'qwer1234', 'Password123', '1q2w3e4r'])('refuses %s', async (newPassword) => {
    expect(await failedProperties(cls, { ...base, newPassword })).toEqual(['newPassword']);
  });
});
