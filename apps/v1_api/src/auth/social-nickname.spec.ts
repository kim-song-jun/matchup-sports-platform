import { ConflictException } from '@nestjs/common';
import { generateSocialNickname } from './social-nickname';

const never = async () => false;
const SHAPE = /^[가-힣]+\d{1,4}$/;

describe('generateSocialNickname', () => {
  it('makes an adjective+animal+number nickname within 20 characters', async () => {
    for (let i = 0; i < 200; i += 1) {
      const nickname = await generateSocialNickname(never);
      expect(nickname).toMatch(SHAPE);
      expect(Array.from(nickname).length).toBeLessThanOrEqual(20);
    }
  });

  it('is deterministic for a fixed random source', async () => {
    await expect(generateSocialNickname(never, () => 0)).resolves.toBe('씩씩한오리너구리1');
  });

  it('retries with a new candidate when the first one is taken', async () => {
    const seen: string[] = [];
    let n = 0;
    const random = () => ((n += 1) % 7) / 7;
    const nickname = await generateSocialNickname(async (candidate) => {
      seen.push(candidate);
      return seen.length < 3;
    }, random);
    expect(seen).toHaveLength(3);
    expect(nickname).toBe(seen[2]);
  });

  it('widens the number as collisions pile up', async () => {
    const seen: string[] = [];
    await generateSocialNickname(async (candidate) => {
      seen.push(candidate);
      return seen.length < 10;
    }, () => 0.99);
    expect(seen[0]).toMatch(/[가-힣]\d$/);
    expect(seen[9]).toMatch(/\d{4}$/);
  });

  it('throws instead of returning an unchecked nickname when every attempt is taken', async () => {
    const isTaken = jest.fn(async () => true);
    await expect(generateSocialNickname(isTaken)).rejects.toBeInstanceOf(ConflictException);
    expect(isTaken).toHaveBeenCalledTimes(12);
  });
});
