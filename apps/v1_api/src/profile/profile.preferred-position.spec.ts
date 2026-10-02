import { PrismaService } from '../prisma/prisma.service';
import { ProfileService } from './profile.service';

/**
 * [D14] 선호 포지션 검증이 **실제 저장 경로에 연결돼 있는지** 확인한다.
 *
 * `users/preferred-position.spec.ts` 는 규칙 자체를 검증하지만, 그 함수를 **아무도 안
 * 부르면 그 스펙은 계속 통과한다.** 여기서는 `updateMyPreferences` 를 직접 불러
 * 연결까지 못박는다.
 *
 * 핵심은 **종목별 유효 집합**이다. 전역 화이트리스트 하나로 처리하면 풋살 유저가 축구
 * 자리를 저장할 수 있고, 그 값은 사람 축에 남아 그 사람의 모든 기록 표시와 선수 카드
 * 가중치를 계속 틀리게 만든다 — 경기마다 고칠 기회가 없다.
 */
const USER = {
  id: '6d000000-0000-4000-8000-000000000001',
  email: 'd14@example.test',
  accountStatus: 'active' as const,
  onboardingStatus: 'completed' as const,
};
const FUTSAL_ID = '6d000000-0000-4000-8000-000000000010';
const RUNNING_ID = '6d000000-0000-4000-8000-000000000011';

function buildPrisma(sportCode: string) {
  const created: Record<string, unknown>[] = [];
  const prisma = {
    v1User: { findFirst: jest.fn().mockResolvedValue({ id: USER.id, accountStatus: 'active' }) },
    v1Sport: {
      // 서비스가 code 를 읽어 그 종목의 유효 코드 집합을 정한다.
      findFirst: jest.fn().mockResolvedValue({ id: FUTSAL_ID, code: sportCode }),
    },
    v1SportLevel: { findFirst: jest.fn().mockResolvedValue({ id: 'level-1' }) },
    v1Region: { findFirst: jest.fn().mockResolvedValue({ id: 'region-1' }) },
    v1UserSportPreference: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      createMany: jest.fn(({ data }: { data: Record<string, unknown>[] }) => {
        created.push(...data);
        return Promise.resolve({ count: data.length });
      }),
    },
    v1UserRegion: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    v1UserAuditLog: { create: jest.fn().mockResolvedValue({}) },
    $transaction: jest.fn(),
  } as Record<string, unknown> & { $transaction: jest.Mock };
  prisma.$transaction.mockImplementation((cb: (tx: unknown) => Promise<unknown>) => cb(prisma));
  return { prisma, created };
}

async function save(
  sportCode: string,
  sport: { preferredPosition?: string | null; secondaryPreferredPosition?: string | null },
) {
  const { prisma, created } = buildPrisma(sportCode);
  const service = new ProfileService(prisma as unknown as PrismaService);
  // `updateMyPreferences` 는 저장 후 스냅샷을 다시 읽는다. 이 스펙의 관심사는 **저장
  // 직전 검증**이므로 스냅샷 단계에서 나는 목 미비 오류는 무시한다 -- 검증이 막았어야 할
  // 값이면 그 전에 던지므로 아래 rejects 단언은 여전히 유효하다.
  try {
    await service.updateMyPreferences(USER, {
      sports: [{ sportId: FUTSAL_ID, ...sport }],
      regions: [],
    } as never);
  } catch (error) {
    if (created.length === 0) throw error;
  }
  return created;
}

describe('[D14] updateMyPreferences — 선호 포지션이 저장 경로에서 검증된다', () => {
  it('그 종목의 자리는 저장된다', async () => {
    const created = await save('futsal', { preferredPosition: 'ALA', secondaryPreferredPosition: 'PIVO' });
    expect(created[0]).toEqual(
      expect.objectContaining({ preferredPosition: 'ALA', secondaryPreferredPosition: 'PIVO' }),
    );
  });

  it('미설정은 그대로 null 로 저장된다 — 강제하지 않는다', async () => {
    const created = await save('futsal', {});
    expect(created[0]).toEqual(
      expect.objectContaining({ preferredPosition: null, secondaryPreferredPosition: null }),
    );
  });

  it('다른 종목의 자리는 거부한다 (풋살에 축구 MF)', async () => {
    // 이 테스트가 이 스펙의 이유다. 전역 화이트리스트였다면 통과했을 것이고,
    // 그 값은 사람 축에 영구히 남는다.
    await expect(save('futsal', { preferredPosition: 'MF' })).rejects.toThrow();
  });

  it('주 없이 부만은 거부한다', async () => {
    await expect(save('futsal', { secondaryPreferredPosition: 'PIVO' })).rejects.toThrow();
  });

  it('주와 부가 같으면 거부한다', async () => {
    await expect(
      save('futsal', { preferredPosition: 'ALA', secondaryPreferredPosition: 'ALA' }),
    ).rejects.toThrow();
  });

  it('포지션 개념이 없는 종목에는 어떤 값도 저장할 수 없다 (러닝)', async () => {
    // 프리셋이 없어 유효 코드가 0개다. 화면도 그 종목엔 섹션을 안 띄우지만,
    // **API 는 아무 문자열이나 받을 수 있으므로** 여기서 막는다.
    await expect(save('running', { preferredPosition: 'ALA' })).rejects.toThrow();
    // 다만 미설정은 여전히 정상이다.
    const created = await save('running', {});
    expect(created[0]).toEqual(expect.objectContaining({ preferredPosition: null }));
  });
});

// RUNNING_ID 는 위 시나리오 설명용 상수다(목 prisma 는 sportId 를 구분하지 않는다).
void RUNNING_ID;
