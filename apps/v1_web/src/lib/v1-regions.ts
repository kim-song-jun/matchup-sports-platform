import type { V1Region } from '@/types/api';

export type V1RegionOption = {
  id: string;
  name: string;
  shortName: string;
  parentName: string;
};

export function toDistrictRegionOptions(regions: V1Region[] = []): V1RegionOption[] {
  const parentById = new Map(regions.filter((region) => region.level === 1).map((region) => [region.id, region]));
  const nestedDistricts = regions.flatMap((parent) =>
    (parent.children ?? []).map((child) => ({
      ...child,
      parentId: child.parentId ?? parent.id,
      parent: child.parent ?? { id: parent.id, code: parent.code, name: parent.name },
    })),
  );
  const flatRegions = [...regions, ...nestedDistricts];

  const seen = new Set<string>();

  return flatRegions
    .filter((region) => region.level === 2 && region.parentId)
    .filter((region) => {
      if (seen.has(region.id)) return false;
      seen.add(region.id);
      return true;
    })
    .map((region) => {
      const parentName = region.parent?.name ?? parentById.get(region.parentId ?? '')?.name ?? '';
      return {
        id: region.id,
        name: parentName ? `${parentName} ${region.name}` : region.name,
        shortName: region.name,
        parentName,
      };
    });
}

/**
 * 시/도 전체를 가리키는 표기. DB 의 시/도 이름은 짧은 이름('경기')이라 그대로 "경기 전체"로 쓰면
 * 종목 앱에서 "경기(시합) 전체"로 읽힌다 — 그 한 곳만 정식 이름으로 풀어 쓴다.
 */
const PROVINCE_WIDE_NAMES: Record<string, string> = { 경기: '경기도' };

export function formatProvinceWide(name: string): string {
  return `${PROVINCE_WIDE_NAMES[name] ?? name} 전체`;
}

export function toTeamRegionOptions(regions: V1Region[] = []): V1RegionOption[] {
  const parentById = new Map(regions.filter((region) => region.level === 1).map((region) => [region.id, region]));
  const nestedDistricts = regions.flatMap((parent) =>
    (parent.children ?? []).map((child) => ({
      ...child,
      parentId: child.parentId ?? parent.id,
      parent: child.parent ?? { id: parent.id, code: parent.code, name: parent.name },
    })),
  );
  const flatRegions = [...regions, ...nestedDistricts];
  const seen = new Set<string>();

  return flatRegions
    .filter((region) => region.level === 1 || (region.level === 2 && region.parentId))
    .filter((region) => {
      if (seen.has(region.id)) return false;
      seen.add(region.id);
      return true;
    })
    .map((region) => {
      if (region.level === 1) {
        return {
          id: region.id,
          name: formatProvinceWide(region.name),
          shortName: '전체',
          parentName: region.name,
        };
      }

      const parentName = region.parent?.name ?? parentById.get(region.parentId ?? '')?.name ?? '';
      return {
        id: region.id,
        name: parentName ? `${parentName} ${region.name}` : region.name,
        shortName: region.name,
        parentName,
      };
    });
}
