import * as crypto from 'crypto';
import { hashPassword, verifyPassword, verifyPasswordConstantCost, needsPasswordRehash } from './password-hash';

jest.mock('crypto', () => {
  const actual = jest.requireActual<typeof import('crypto')>('crypto');
  return { ...actual, scrypt: jest.fn(actual.scrypt) };
});

const scryptCalls = () => (crypto.scrypt as unknown as jest.Mock).mock.calls.length;

describe('verifyPasswordConstantCost', () => {
  it('pays both supported work factors for missing and existing hashes, and never matches a missing hash', async () => {
    const stored = await hashPassword('Correct-horse-1!');

    const beforeMissing = scryptCalls();
    await expect(verifyPasswordConstantCost('Correct-horse-1!', null)).resolves.toBe(false);
    await expect(verifyPasswordConstantCost('Correct-horse-1!', undefined)).resolves.toBe(false);
    const missingCost = scryptCalls() - beforeMissing;

    const beforeStored = scryptCalls();
    await verifyPasswordConstantCost('wrong-password-1', stored);
    const storedCost = scryptCalls() - beforeStored;

    expect(missingCost).toBe(4);
    expect(storedCost).toBe(2);
    const expectedWork = [{ N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 },
      { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 }];
    const calls = (crypto.scrypt as unknown as jest.Mock).mock.calls;
    expect(calls.slice(beforeMissing, beforeMissing + 2).map((call) => call[3])).toEqual(expectedWork);
    expect(calls.slice(beforeStored).map((call) => call[3])).toEqual(expectedWork);
  });

  it('matches only the right password when a hash exists', async () => {
    const stored = await hashPassword('Correct-horse-1!');

    await expect(verifyPasswordConstantCost('Correct-horse-1!', stored)).resolves.toBe(true);
    await expect(verifyPasswordConstantCost('Correct-horse-2!', stored)).resolves.toBe(false);
    await expect(verifyPassword('Correct-horse-1!', null)).resolves.toBe(false);
  });
});

describe('versioned password work factor and compatibility', () => {
  it('rejects malformed, oversized and attacker-controlled work factors', async () => {
    for (const hash of ['scrypt:a:ff', 'scrypt$v1$1073741824$8$3$aa$bb', 'scrypt$v1$32768$8$3$bad$bad']) {
      await expect(verifyPassword('fixture', hash)).resolves.toBe(false);
    }
  });
});

it('verifies a legacy credential and requests an upgrade only for that format', async () => {
  const salt = '12345678901234567890123456789012';
  const key = crypto.scryptSync('Legacy-password!', salt, 64).toString('hex');
  const legacy = `scrypt:${salt}:${key}`;
  await expect(verifyPasswordConstantCost('Legacy-password!', legacy)).resolves.toBe(true);
  await expect(verifyPasswordConstantCost('wrong-password!', legacy)).resolves.toBe(false);
  expect(needsPasswordRehash(legacy)).toBe(true);
  const upgraded = await hashPassword('Legacy-password!');
  await expect(verifyPassword('Legacy-password!', upgraded)).resolves.toBe(true);
  expect(needsPasswordRehash(upgraded)).toBe(false);
  expect(needsPasswordRehash('invalid')).toBe(false);
});
