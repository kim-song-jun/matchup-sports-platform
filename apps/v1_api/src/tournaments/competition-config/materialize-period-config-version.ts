import { ConflictException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { competitionConfigContentHash, validateCompetitionConfig } from './competition-config';
import { isReusableCompetitionPeriodConfig } from './competition-config-periods';

type ConfigSource = {
  id: string;
  sportCode: string;
  name: string;
  version: number;
  periods: Prisma.JsonValue;
  events: Prisma.JsonValue;
  lineup: Prisma.JsonValue;
  result: Prisma.JsonValue;
  tieBreak: Prisma.JsonValue;
  visibility: Prisma.JsonValue;
};

/** 현재 규칙의 피리어드만 바꾼 immutable 버전을 재사용하거나 만든다. */
export async function materializePeriodConfigVersion(
  tx: Prisma.TransactionClient,
  input: { source: ConfigSource; periods: Prisma.JsonValue; createdByUserId: string | null },
) {
  const config = validateCompetitionConfig({
    periods: input.periods,
    events: input.source.events,
    lineup: input.source.lineup,
    result: input.source.result,
    tieBreak: input.source.tieBreak,
    visibility: input.source.visibility,
  }, { preserveMissingCatalogKeys: true });
  const contentHash = competitionConfigContentHash(config);
  const existing = await tx.v1CompetitionConfigVersion.findUnique({ where: { contentHash } });
  if (existing) {
    if (!isReusableCompetitionPeriodConfig(existing, input.source.sportCode, config)) {
      throw new ConflictException({
        code: 'COMPETITION_CONFIG_CONTENT_HASH_COLLISION',
        message: '동일한 해시의 설정이 다른 종목·비활성 버전이거나 실제 내용이 달라 재사용할 수 없어요.',
      });
    }
    return { version: existing, created: false as const };
  }

  // 같은 종목·설정 이름의 version 증가를 직렬화한다. 대회별 advisory lock만으로는 서로 다른 대회가
  // 같은 설정 계열에 동시에 버전을 만들 때의 unique(sportCode, name, version) 충돌을 막지 못한다.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`competition-config-version:${input.source.sportCode}:${input.source.name}`}, 0))`;
  const afterLock = await tx.v1CompetitionConfigVersion.findUnique({ where: { contentHash } });
  if (afterLock) {
    if (!isReusableCompetitionPeriodConfig(afterLock, input.source.sportCode, config)) {
      throw new ConflictException({ code: 'COMPETITION_CONFIG_CONTENT_HASH_COLLISION', message: '동일한 해시의 경기 설정을 재사용할 수 없어요.' });
    }
    return { version: afterLock, created: false as const };
  }
  const latest = await tx.v1CompetitionConfigVersion.findFirst({
    where: { sportCode: input.source.sportCode, name: input.source.name },
    orderBy: { version: 'desc' },
  });
  const version = await tx.v1CompetitionConfigVersion.create({
    data: {
      sportCode: input.source.sportCode,
      name: input.source.name,
      version: (latest?.version ?? input.source.version) + 1,
      createdByUserId: input.createdByUserId,
      periods: config.periods as Prisma.InputJsonValue,
      events: config.events as Prisma.InputJsonValue,
      lineup: config.lineup as Prisma.InputJsonValue,
      result: config.result as Prisma.InputJsonValue,
      tieBreak: config.tieBreak as Prisma.InputJsonValue,
      visibility: config.visibility as Prisma.InputJsonValue,
      contentHash,
    },
  });
  return { version, created: true as const };
}
