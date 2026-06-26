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
