import { UnprocessableEntityException } from '@nestjs/common';
import { LineupSizeConfigResolver } from './lineup-size-config-resolver';
import type { V1AuthUser } from '../../auth/v1-auth-user';

/**
 * 교체 상한 판정의 계층 경계를 못박는 스펙.
 *
 * 적대적 검수에서 "제한형인데 상한 null 이 저장돼 제한이 무력화된다"는 결함이 나왔고,
 * 처음엔 이 리졸버에서 null 을 막으려 했다 — 그런데 그러면 **이미 pin된 레거시 설정
 * (개수 없는 limited)을 그대로 이어받는 정상 경로까지 깨진다**(CI 에서 실제로
 * `tournaments-admin.service.spec.ts` 의 "출전 인원만 바꾸기" 케이스가 터졌다).
 *
 * 이 계층은 "관리자가 제한형을 고르며 개수를 비웠다"와 "기존 값을 승계한다"를 구분할 수
 * 없다 — dto 를 보는 호출부만 안다. 그래서 전자는 `TournamentsAdminService
 * .assertSubstitutionPolicyPair()` 가 막고, 이 리졸버는 승계를 깨지 않는 것이 계약이다.
 * 아래 두 테스트는 그 경계가 뒤집히면 깨진다.
 *
 * DB 를 타지 않는다: 두 판정 모두 유일한 Prisma 접근(findOrCreateVersion)보다 먼저
 * 끝나므로, 의존성은 "호출되면 실패하는 스텁"으로 둔다 — 스텁이 불렸다면 그것 자체가
 * DB 앞에서 결론내지 못했다는 신호다.
 */
describe('LineupSizeConfigResolver — 교체 상한 계층 경계', () => {
  const user = { id: 'admin-1' } as V1AuthUser;

  function resolver() {
    const explode = (name: string) => () => {
      throw new Error(`DB 접근 전에 결론났어야 한다: ${name} 이 호출됨`);
    };
    const prisma = new Proxy({}, { get: (_t, p) => explode(String(p)) });
    const adminContext = new Proxy({}, { get: (_t, p) => explode(String(p)) });
    return new LineupSizeConfigResolver(prisma as never, adminContext as never);
  }

  it('canonical 이 무제한인 종목을 제한형으로 바꾸며 개수를 생략하면 지어내지 않고 거부한다', async () => {
    // futsal canonical = rolling/null → 채울 기본 횟수가 없다.
    await expect(
      resolver().resolveVersionForLineupConfig(user, 'futsal', { substitutionMode: 'limited' }),
    ).rejects.toMatchObject({ response: { code: 'SUBSTITUTION_LIMIT_REQUIRED' } });
  });

  it('거부는 UnprocessableEntityException 이다', async () => {
    await expect(
      resolver().resolveVersionForLineupConfig(user, 'futsal', { substitutionMode: 'limited' }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('레거시 승계(개수 없는 limited)는 이 계층에서 막지 않는다 — 막으면 출전 인원만 바꾸는 정상 경로가 깨진다', async () => {
    // maxSubstitutions: null 은 "pin된 레거시 값을 그대로 넘긴 것"일 수 있다. 여기서
    // 거부하면 안 되고, 판정을 통과해 DB 접근까지 진행되어야 한다 — 스텁 prisma 라
    // 결국 실패하지만, 그 실패가 SUBSTITUTION_LIMIT_REQUIRED 가 아니라는 것이 요점이다.
    const error = await resolver()
      .resolveVersionForLineupConfig(user, 'futsal', { substitutionMode: 'limited', maxSubstitutions: null })
      .then(
        () => null,
        (e: unknown) => e,
      );
    expect(error).not.toBeNull();
    expect((error as { response?: { code?: string } }).response?.code).not.toBe('SUBSTITUTION_LIMIT_REQUIRED');
    expect(error).not.toBeInstanceOf(UnprocessableEntityException);
  });
});
