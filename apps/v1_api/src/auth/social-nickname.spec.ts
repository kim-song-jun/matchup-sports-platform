import { generateSocialNickname, normalizeSocialNicknameSeed } from './social-nickname';

const never = async () => false;
const always = async () => true;

describe('normalizeSocialNicknameSeed', () => {
  it('collapses whitespace, strips control characters and trims', () => {
    expect(normalizeSocialNicknameSeed('  카카오 \n  닉\u0007네임  ')).toBe('카카오 닉네임');
  });

  it('cuts to 20 characters', () => {
    expect(normalizeSocialNicknameSeed('가'.repeat(30))).toBe('가'.repeat(20));
  });

  it.each([null, undefined, '', '  ', '가'])('returns null for %p (under 2 characters)', (seed) => {
    expect(normalizeSocialNicknameSeed(seed)).toBeNull();
  });
});

describe('generateSocialNickname', () => {
  it('uses the seed as is when it is free', async () => {
    await expect(generateSocialNickname('카카오닉', never)).resolves.toBe('카카오닉');
  });

  it('adds a numeric suffix when the seed is taken', async () => {
    const taken = new Set(['카카오닉']);
    const nickname = await generateSocialNickname('카카오닉', async (n) => taken.has(n), () => 0.42);

    expect(nickname).toBe('카카오닉42');
  });

  it('keeps suffixed names within 20 characters', async () => {
    const seed = '가'.repeat(20);
    const nickname = await generateSocialNickname(seed, async (n) => n === seed, () => 0.5);

    expect(nickname).toHaveLength(20);
    expect(nickname.endsWith('50')).toBe(true);
  });

  it('falls back to a generic name when there is no seed', async () => {
    await expect(generateSocialNickname(null, never, () => 0.5)).resolves.toBe('팀밋사용자5000');
  });

  it('terminates with a fallback name even if every candidate is taken', async () => {
    const calls: string[] = [];
    const nickname = await generateSocialNickname(
      '카카오닉',
      async (n) => {
        calls.push(n);
        return always();
      },
      () => 0.1,
    );

    expect(nickname).toMatch(/^팀밋사용자\d{4}$/);
    expect(calls.length).toBeLessThan(30);
  });
});
