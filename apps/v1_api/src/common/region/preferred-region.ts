/**
 * 활동 지역 우선("내 지역 먼저") — 팀·개인 매치·팀 매치 목록이 같은 판정을 쓴다.
 *
 * 지역은 실제로는 구/군 단위에 저장되므로, 시/도를 주면 그 하위 구/군도 같은 지역이다
 * (각 목록의 `regionId` 필터가 `region: { OR: [{ id }, { parentId }] }` 로 거는 것과 같은 규칙).
 * 지역이 없는 행(`regionId` null)은 어느 지역에도 속하지 않는다.
 *
 * 서버는 로그인 사용자의 활동 지역을 읽지 않는다 — 호출한 쪽이 `preferRegionId` 로 명시해야
 * 같은 주소가 같은 결과를 내고 응답 캐시가 사용자 사이에 섞이지 않는다.
 *
 * 이 파일은 `@prisma/client` 를 import 하지 않는다(단위 테스트가 DB 타입 없이 돌도록).
 */

/** 지역을 판정하는 데 필요한 행 모양. `select` 에 `PREFERRED_REGION_SELECT` 를 펼쳐 넣는다. */
export interface RegionPreferenceRow {
  regionId: string | null;
  region?: { parentId: string | null } | null;
}

export const PREFERRED_REGION_SELECT = { regionId: true, region: { select: { parentId: true } } } as const;

export function isInPreferredRegion(row: RegionPreferenceRow, preferRegionId: string | undefined): boolean {
  if (!preferRegionId) return false;
  return row.regionId === preferRegionId || row.region?.parentId === preferRegionId;
}
