import type { V1Region } from '@/types/api';

export type V1RegionOption = {
  id: string;
  name: string;
  shortName: string;
  parentName: string;
};

export function toDistrictRegionOptions(regions: V1Region[] = []): V1RegionOption[] {
  const parentById = new Map(regions.filter((region) => region.level === 1).map((region) => [region.id, region]));

  return regions
    .filter((region) => region.level === 2 && region.parentId)
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
