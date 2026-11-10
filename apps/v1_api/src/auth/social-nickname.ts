import { ConflictException } from '@nestjs/common';

const MAX_NICKNAME_LENGTH = 20;
const MAX_ATTEMPTS = 12;

const ADJECTIVES = [
  '씩씩한', '재빠른', '느긋한', '용감한', '활발한', '다정한', '듬직한', '명랑한', '든든한', '상냥한',
  '엉뚱한', '부지런한', '당당한', '눈부신', '날쌘', '푸근한', '야무진', '포근한', '의젓한', '반짝이는',
  '힘센', '똑똑한', '유쾌한', '꾸준한', '빠른', '튼튼한', '해맑은', '느림보', '차분한', '신나는',
] as const;

const ANIMALS = [
  '오리너구리', '고라니', '수달', '다람쥐', '고양이', '강아지', '펭귄', '여우', '토끼', '판다',
  '두루미', '해달', '사슴', '부엉이', '미어캣', '알파카', '캥거루', '돌고래', '코알라', '너구리',
  '참새', '고슴도치', '청설모', '거북이', '하마', '기린', '앵무새', '오소리', '족제비', '카피바라',
] as const;

function pick<T>(items: readonly T[], random: () => number): T {
  return items[Math.min(items.length - 1, Math.floor(random() * items.length))];
}

function randomNumber(attempt: number, random: () => number): string {
  // 1~2 digits first, widening as collisions pile up: 씩씩한오리너구리4 → …4821.
  const digits = Math.min(1 + Math.floor(attempt / 3), 4);
  return String(1 + Math.floor(random() * (10 ** digits - 1)));
}

/**
 * Builds a random Korean nickname (adjective + animal + number) for a social signup.
 * It is deliberately independent of the Kakao/Apple display name. Every returned value was
 * checked with `isTaken`; exhausting the bounded retries throws instead of returning an
 * unchecked name.
 */
export async function generateSocialNickname(
  isTaken: (nickname: string) => Promise<boolean>,
  random: () => number = Math.random,
): Promise<string> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const candidate = `${pick(ADJECTIVES, random)}${pick(ANIMALS, random)}${randomNumber(attempt, random)}`;
    if (Array.from(candidate).length <= MAX_NICKNAME_LENGTH && !(await isTaken(candidate))) {
      return candidate;
    }
  }
  throw new ConflictException({
    code: 'NICKNAME_GENERATION_FAILED',
    message: '닉네임을 자동으로 만들지 못했어요. 잠시 후 다시 시도해 주세요.',
  });
}
