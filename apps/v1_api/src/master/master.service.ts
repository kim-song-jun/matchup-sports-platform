import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ResolveLocationDto } from './dto/resolve-location.dto';

type KakaoRegionDocument = {
  region_type?: string;
  region_1depth_name?: string;
  region_2depth_name?: string;
};

@Injectable()
export class MasterService {
  constructor(private readonly prisma: PrismaService) {}

  async getSports() {
    const sports = await this.prisma.v1Sport.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        code: true,
        name: true,
        levels: {
          where: { isActive: true },
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
          select: {
            id: true,
            code: true,
            name: true,
            description: true,
          },
        },
      },
    });

    return { sports };
  }

  async getRegions() {
    const regions = await this.prisma.v1Region.findMany({
      where: {
        isActive: true,
        parentId: null,
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        code: true,
        name: true,
        level: true,
        centerLat: true,
        centerLng: true,
        children: {
          where: { isActive: true },
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
          select: {
            id: true,
            code: true,
            name: true,
            level: true,
            centerLat: true,
            centerLng: true,
          },
        },
      },
    });

    return { regions };
  }

  async resolveLocation(dto: ResolveLocationDto) {
    const kakaoRegion = await this.resolveByKakao(dto.longitude, dto.latitude);
    const kakaoMatch = kakaoRegion ? await this.findRegionByNames(kakaoRegion) : null;
    if (kakaoMatch) {
      return {
        region: kakaoMatch,
        source: 'kakao',
      };
    }

    const nearest = await this.findNearestRegion(dto.latitude, dto.longitude);
    return {
      region: nearest?.region ?? null,
      source: nearest ? 'nearest' : 'none',
      distanceMeters: nearest?.distanceMeters ?? null,
    };
  }

  private async resolveByKakao(longitude: number, latitude: number) {
    const clientId = process.env.KAKAO_CLIENT_ID;
    if (!clientId) return null;

    try {
      const url = new URL('https://dapi.kakao.com/v2/local/geo/coord2regioncode.json');
      url.searchParams.set('x', String(longitude));
      url.searchParams.set('y', String(latitude));

      const response = await fetch(url, {
        headers: { Authorization: `KakaoAK ${clientId}` },
      });

      if (!response.ok) return null;
      const data = (await response.json()) as { documents?: KakaoRegionDocument[] };
      return data.documents?.find((document) => document.region_type === 'H') ?? data.documents?.[0] ?? null;
    } catch {
      return null;
    }
  }

  private async findRegionByNames(document: KakaoRegionDocument) {
    const sidoName = normalizeRegionName(document.region_1depth_name);
    const districtName = normalizeDistrictName(document.region_2depth_name);
    if (!sidoName || !districtName) return null;

    return this.prisma.v1Region.findFirst({
      where: {
        level: 2,
        isActive: true,
        name: districtName,
        parent: {
          is: {
            name: sidoName,
            isActive: true,
          },
        },
      },
      select: {
        id: true,
        code: true,
        name: true,
        level: true,
        parentId: true,
        parent: { select: { id: true, code: true, name: true } },
      },
    });
  }

  private async findNearestRegion(latitude: number, longitude: number) {
    const regions = await this.prisma.v1Region.findMany({
      where: {
        level: 2,
        isActive: true,
        centerLat: { not: null },
        centerLng: { not: null },
      },
      select: {
        id: true,
        code: true,
        name: true,
        level: true,
        parentId: true,
        centerLat: true,
        centerLng: true,
        parent: { select: { id: true, code: true, name: true } },
      },
    });

    const nearest = regions
      .map((region) => ({
        region: {
          id: region.id,
          code: region.code,
          name: region.name,
          level: region.level,
          parentId: region.parentId,
          parent: region.parent,
        },
        distanceMeters: distanceMeters(latitude, longitude, region.centerLat ?? 0, region.centerLng ?? 0),
      }))
      .sort((a, b) => a.distanceMeters - b.distanceMeters)[0];

    return nearest && nearest.distanceMeters <= 60000 ? nearest : null;
  }
}

function normalizeRegionName(value?: string | null) {
  if (!value) return null;
  return value
    .trim()
    .replace(/특별시$|광역시$|특별자치시$|특별자치도$|자치도$|도$/u, '')
    .replace(/^서울$/u, '서울')
    .replace(/^경기$/u, '경기');
}

function normalizeDistrictName(value?: string | null) {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  const cityPart = trimmed.split(/\s+/u)[0];
  return cityPart || trimmed;
}

function distanceMeters(latA: number, lngA: number, latB: number, lngB: number) {
  const earthRadiusMeters = 6371000;
  const dLat = toRadians(latB - latA);
  const dLng = toRadians(lngB - lngA);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(latA)) * Math.cos(toRadians(latB)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}
