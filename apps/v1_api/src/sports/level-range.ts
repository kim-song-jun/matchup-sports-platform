import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export const SPORT_LEVEL_CODES = ['beginner', 'novice', 'intermediate', 'advanced'] as const;

export type SportLevelCode = (typeof SPORT_LEVEL_CODES)[number];

export type SportLevelRange = {
  minSportLevelId: string | null;
  maxSportLevelId: string | null;
};

type SportLevelRecord = {
  id: string;
  code: string;
  name: string;
  sortOrder: number;
  sportId: string;
};

export function parseLevelCodes(value?: string | null): SportLevelCode[] {
  if (!value) return [];
  return Array.from(
    new Set(
      value
        .split(',')
        .map((item) => item.trim())
        .filter((item): item is SportLevelCode => SPORT_LEVEL_CODES.includes(item as SportLevelCode)),
    ),
  );
}

/**
 * 고른 레벨 중 하나라도 범위에 드는 글. 목록 where 의 `AND` 배열에 펼쳐 넣는다.
 * 객체로 펼치면 `OR` 키가 목록의 공개 조건 `OR`(지난 글 숨김·대회 경기 제외)을 덮어써
 * 레벨만 골라도 종료·취소된 글이 다시 나온다.
 */
export function levelCodeConstraints(levelCodes: SportLevelCode[]) {
  if (levelCodes.length === 0) return [];

  return [{
    OR: levelCodes.map((code) => {
      const index = SPORT_LEVEL_CODES.indexOf(code);
      return {
        minSportLevel: { is: { code: { in: SPORT_LEVEL_CODES.slice(0, index + 1) } } },
        maxSportLevel: { is: { code: { in: SPORT_LEVEL_CODES.slice(index) } } },
      };
    }),
  }];
}

export function formatLevelRange(minLevel?: Pick<SportLevelRecord, 'name'> | null, maxLevel?: Pick<SportLevelRecord, 'name'> | null, fallback?: string | null) {
  if (minLevel && maxLevel) return minLevel.name === maxLevel.name ? minLevel.name : `${minLevel.name}-${maxLevel.name}`;
  return fallback ?? null;
}

export async function resolveSportLevelRange(
  tx: Pick<Prisma.TransactionClient, 'v1SportLevel'>,
  sportId: string,
  minLevelCode?: string | null,
  maxLevelCode?: string | null,
): Promise<SportLevelRange> {
  if (!minLevelCode && !maxLevelCode) return { minSportLevelId: null, maxSportLevelId: null };

  const minCode = minLevelCode ?? maxLevelCode;
  const maxCode = maxLevelCode ?? minLevelCode;
  if (!isSportLevelCode(minCode) || !isSportLevelCode(maxCode)) {
    throw validationError('level code is invalid', !isSportLevelCode(minCode) ? 'minLevelCode' : 'maxLevelCode');
  }

  const levels = await tx.v1SportLevel.findMany({
    where: { sportId, code: { in: [minCode, maxCode] }, isActive: true },
    select: { id: true, code: true, sortOrder: true },
  });
  const minLevel = levels.find((level) => level.code === minCode);
  const maxLevel = levels.find((level) => level.code === maxCode);
  if (!minLevel || !maxLevel) {
    throw validationError('level code does not belong to the selected active sport', !minLevel ? 'minLevelCode' : 'maxLevelCode');
  }
  if (minLevel.sortOrder > maxLevel.sortOrder) {
    throw validationError('minLevelCode cannot be higher than maxLevelCode', 'minLevelCode');
  }

  return { minSportLevelId: minLevel.id, maxSportLevelId: maxLevel.id };
}

function isSportLevelCode(value?: string | null): value is SportLevelCode {
  return SPORT_LEVEL_CODES.includes(value as SportLevelCode);
}

function validationError(message: string, field: string) {
  return new BadRequestException({
    code: 'VALIDATION_FAILED',
    message,
    details: { field },
  });
}
