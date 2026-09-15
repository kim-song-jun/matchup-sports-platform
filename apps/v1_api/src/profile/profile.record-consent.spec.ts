import { V1ConsentState } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ProfileService } from './profile.service';

const user = {
  id: 'user-1',
  email: 'consent@teameet.test',
  accountStatus: 'active' as const,
  onboardingStatus: 'completed' as const,
};

/**
 * v1_user_record_consents 는 userId 가 PK인 단일 row 모델이므로, upsert/findUnique
 * 호출 인자만 검증하는 형식적 테스트는 "state 가 실제로 GRANTED→REVOKED 로 바뀌는지"를
 * 잡지 못한다. userId 로 상태를 유지하는 in-memory 저장소로 실제 upsert 시맨틱을
 * 재현해 GET/PUT 왕복이 실제 계약을 지키는지 검증한다.
 */
function createFakePrisma() {
  const store = new Map<string, { userId: string; state: V1ConsentState; policyHash: string; effectiveAt: Date }>();

  const v1UserRecordConsent = {
    findUnique: jest.fn(({ where: { userId } }: { where: { userId: string } }) =>
      Promise.resolve(store.get(userId) ?? null),
    ),
    upsert: jest.fn(
      ({
        where: { userId },
        update,
        create,
      }: {
        where: { userId: string };
        update: { state: V1ConsentState; policyHash: string; effectiveAt: Date };
        create: { userId: string; state: V1ConsentState; policyHash: string };
      }) => {
        const existing = store.get(userId);
        const next = existing ? { ...existing, ...update } : { ...create, effectiveAt: new Date() };
        store.set(userId, next);
        return Promise.resolve(next);
      },
    ),
  };

  // Task 154 P0-3: 응답에 `pendingRecordCount` 가 붙으면서 이 서비스가 신원 연결도
  // 읽는다. 이 스펙의 관심사는 GRANTED↔REVOKED 왕복이므로 "연결된 참가자 0명"으로
  // 고정한다 -- 그러면 `countOwnerVisibleParticipations` 가 즉시 0을 돌려주고
  // 나머지 쿼리는 타지 않는다. 카운트 자체의 계약은 public-consent.spec.ts 가 맡는다.
  const v1ParticipantIdentityLinkCurrent = { findMany: jest.fn(() => Promise.resolve([])) };

  return { v1UserRecordConsent, v1ParticipantIdentityLinkCurrent } as unknown as PrismaService;
}

describe('ProfileService record consent', () => {
  it('GET reflects a granted PUT, and a later granted=false PUT flips the row to REVOKED', async () => {
    const prisma = createFakePrisma();
    const service = new ProfileService(prisma);

    const granted = await service.updateMyRecordConsent(user, { granted: true, policyHash: 'policy-v1' });
    // 이미 GRANTED 면 유도할 이유가 없으므로 서버가 카운트를 세지 않고 0 으로 둔다.
    expect(granted).toEqual({
      granted: true,
      effectiveAt: expect.any(String),
      hasResponded: true,
      pendingRecordCount: 0,
    });

    const afterGrant = await service.myRecordConsent(user);
    expect(afterGrant.granted).toBe(true);
    expect(afterGrant.effectiveAt).not.toBeNull();

    const revoked = await service.updateMyRecordConsent(user, { granted: false, policyHash: 'policy-v1' });
    expect(revoked.granted).toBe(false);

    const afterRevoke = await service.myRecordConsent(user);
    expect(afterRevoke.granted).toBe(false);

    // 서비스가 실제로 REVOKED enum 값을 저장했는지(단순 granted:false 응답 필드가 아니라
    // DB 상태 자체)까지 upsert 호출 인자로 확인한다.
    expect(prisma.v1UserRecordConsent.upsert).toHaveBeenLastCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ state: V1ConsentState.REVOKED }),
      }),
    );
  });

  it('GET returns granted:false with a null effectiveAt when the user never responded', async () => {
    const prisma = createFakePrisma();
    const service = new ProfileService(prisma);

    const result = await service.myRecordConsent(user);
    // `granted:false` 만으로는 "거부"와 "아직 안 물어봄"이 구분되지 않는다.
    // 한 번도 응답한 적 없는 사용자는 hasResponded=false 여야 유도 배너가 뜬다.
    expect(result).toEqual({
      granted: false,
      effectiveAt: null,
      hasResponded: false,
      pendingRecordCount: 0,
    });
  });
});
