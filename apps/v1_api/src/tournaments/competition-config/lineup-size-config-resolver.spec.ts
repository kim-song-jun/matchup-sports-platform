import { UnprocessableEntityException } from '@nestjs/common';
import { LineupSizeConfigResolver } from './lineup-size-config-resolver';
import type { V1AuthUser } from '../../auth/v1-auth-user';

/**
 * 적대적 검수에서 나온 회귀 방어.
 *
 * `resolveVersionForLineupConfig()`가 교체 상한을 고를 때 `overrides.maxSubstitutions
 * !== undefined` 로 판정하면 **null 이 통과한다** — 그러면 "제한형(limited)인데 상한
 * null"(= 사실상 무제한)이 조용히 저장돼 관리자가 건 교체 횟수 제한이 무력화된다.
 * 무제한은 오직 `substitutionMode: 'rolling'` 으로만 표현되어야 한다.
 *
 * 이 스펙은 DB 를 타지 않는다: 위 판정과 그로 인한 예외는 `findOrCreateVersion()`
 * (유일한 Prisma 접근)보다 먼저 발생하므로, 의존성은 호출되면 실패하는 스텁으로 둔다
 * — 스텁이 호출됐다면 그것 자체가 "DB 전에 막지 못했다"는 회귀 신호다.
 */
describe('LineupSizeConfigResolver — 교체 상한 판정', () => {
  const user = { id: 'admin-1' } as V1AuthUser;

  function resolver() {
    const explode = (name: string) => () => {
      throw new Error(`DB 접근 전에 막혔어야 한다: ${name} 이 호출됨`);
    };
    const prisma = new Proxy({}, { get: (_t, p) => explode(String(p)) });
    const adminContext = new Proxy({}, { get: (_t, p) => explode(String(p)) });
    return new LineupSizeConfigResolver(prisma as never, adminContext as never);
  }

  it('무제한(rolling) 종목을 제한형으로 바꾸면서 상한을 null 로 주면 거부한다', async () => {
    // futsal canonical = rolling/null. 관리자 폼이 "제한형"을 골랐는데 개수를 비워
    // null 로 보낸 경우 — 여기서 통과시키면 상한 없는 limited 가 저장된다.
    await expect(
      resolver().resolveVersionForLineupConfig(user, 'futsal', {
        substitutionMode: 'limited',
        maxSubstitutions: null,
      }),
    ).rejects.toMatchObject({ response: { code: 'SUBSTITUTION_LIMIT_REQUIRED' } });
  });

  it('제한형으로 바꾸면서 상한을 아예 생략해도 동일하게 거부한다', async () => {
    await expect(
      resolver().resolveVersionForLineupConfig(user, 'futsal', {
        substitutionMode: 'limited',
      }),
    ).rejects.toMatchObject({ response: { code: 'SUBSTITUTION_LIMIT_REQUIRED' } });
  });

  it('거부는 UnprocessableEntityException 이다', async () => {
    await expect(
      resolver().resolveVersionForLineupConfig(user, 'futsal', {
        substitutionMode: 'limited',
        maxSubstitutions: null,
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });
});
