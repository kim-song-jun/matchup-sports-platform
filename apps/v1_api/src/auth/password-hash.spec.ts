import * as crypto from 'crypto';
import { hashPassword, verifyPassword, verifyPasswordConstantCost } from './password-hash';

jest.mock('crypto', () => {
  const actual = jest.requireActual<typeof import('crypto')>('crypto');
  return { ...actual, scrypt: jest.fn(actual.scrypt) };
});

const scryptCalls = () => (crypto.scrypt as unknown as jest.Mock).mock.calls.length;

describe('verifyPasswordConstantCost', () => {
  it('pays one scrypt for a missing hash, exactly like checking against a stored hash, and never matches', async () => {
    const stored = await hashPassword('Correct-horse-1!');

    const beforeMissing = scryptCalls();
    await expect(verifyPasswordConstantCost('Correct-horse-1!', null)).resolves.toBe(false);
    await expect(verifyPasswordConstantCost('Correct-horse-1!', undefined)).resolves.toBe(false);
    const missingCost = scryptCalls() - beforeMissing;

    const beforeStored = scryptCalls();
    await verifyPasswordConstantCost('wrong-password-1', stored);
    const storedCost = scryptCalls() - beforeStored;

    expect(missingCost).toBe(2);
    expect(storedCost).toBe(1);
  });

  it('matches only the right password when a hash exists', async () => {
    const stored = await hashPassword('Correct-horse-1!');

    await expect(verifyPasswordConstantCost('Correct-horse-1!', stored)).resolves.toBe(true);
    await expect(verifyPasswordConstantCost('Correct-horse-2!', stored)).resolves.toBe(false);
    await expect(verifyPassword('Correct-horse-1!', null)).resolves.toBe(false);
  });
});
