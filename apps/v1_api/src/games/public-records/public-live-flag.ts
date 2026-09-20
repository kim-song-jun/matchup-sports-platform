import type { PrismaService } from '../../prisma/prisma.service';

/**
 * D-06 게이팅의 런타임 축(`PUBLIC_LIVE` 운영 킬스위치)을 읽는 단일 소스.
 *
 * 플래그 row 가 없으면(마이그레이션에 seed 가 없다) off 취급한다 —
 * `effectivePublicVisibilityMode` 가 그 경우 LIVE 를 `official_only` 로 강등시켜
 * 진행 중 숫자만 끊고 확정 결과는 그대로 공개한다.
 *
 * 같은 조회가 공개 기록 서비스 두 곳에 private 메서드로 복제돼 있었다
 * (`public-team-records.service.ts` 의 주석이 이 추출을 후속 작업으로 명시했다).
 * 리그 일정 목록·대회 상세까지 같은 플래그를 읽어야 해서 복제본이 넷이 되기 전에 뽑는다.
 */
export async function isPublicLiveEnabled(prisma: PrismaService): Promise<boolean> {
  const flag = await prisma.v1GameOperationFlag.findUnique({
    where: { key: 'PUBLIC_LIVE' },
    select: { value: true },
  });
  return flag?.value === 'on';
}
