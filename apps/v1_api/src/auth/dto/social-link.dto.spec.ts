import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SocialLinkDto } from './social-link.dto';

const VALID = { phone: '01012345678', proofToken: 'v1.token' };

async function failedProperties(input: Record<string, unknown>) {
  const errors = await validate(plainToInstance(SocialLinkDto, input), {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return errors.map((error) => error.property);
}

describe('SocialLinkDto', () => {
  it('accepts an 11-digit phone and a proof token', async () => {
    expect(await failedProperties(VALID)).toEqual([]);
  });

  it.each([
    ['phone', '010-1234-5678'],
    ['phone', '0101234567'],
    ['proofToken', ''],
    ['proofToken', 'x'.repeat(513)],
  ])('rejects %s=%j', async (field, value) => {
    expect(await failedProperties({ ...VALID, [field]: value })).toEqual([field]);
  });

  it('rejects fields outside the contract', async () => {
    expect(await failedProperties({ ...VALID, userId: 'other' })).toEqual(['userId']);
  });
});
