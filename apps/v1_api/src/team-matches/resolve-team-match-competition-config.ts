import { Prisma } from '@prisma/client';
import type { V1CompetitionConfigVersion } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { ConflictException, UnprocessableEntityException } from '@nestjs/common';
import { competitionConfigContentHash, tryNormalizeCompetitionSportCode, validateCompetitionConfig } from '../tournaments/competition-config/competition-config';
import { isReusableCompetitionPeriodConfig, normalizeCompetitionPeriods } from '../tournaments/competition-config/competition-config-periods';
import { MAX_TEAM_MATCH_PERIOD_MINUTES } from './team-match-periods.constants';

/**
 * 팀매치(및 리그 대진)에 pin할 활성 competition config를 스포츠 코드로 찾는다.
 * team-matches.service.ts의 loadTeamMatchCreationSource에 있던 로직을 그대로 뽑았다 —
 * 어드민 리그 대진 생성(league-match-admin.service.ts)도 팀 멤버 권한 체크 없이
 * 이 조회만 재사용해야 하기 때문. DB 트리거(v1_pin_team_match_competition_config)가
 * V1TeamMatch insert 시 같은 종목인지 검증한다. 일반 기본값 조회는 이 함수로 유지하고,
 * 사용자 경기 기간 설정은 별도 계열의 immutable version으로 발행한다.
 */
export async function resolveTeamMatchCompetitionConfig(
  tx: Prisma.TransactionClient,
  sportId: string,
): Promise<{ id: string } | null> {
  const sport = await tx.v1Sport.findFirst({
    where: { id: sportId, isActive: true },
    select: { code: true },
  });
  const competitionSportCode = tryNormalizeCompetitionSportCode(sport?.code);
  if (competitionSportCode === null) return null;
  return tx.v1CompetitionConfigVersion.findFirst({
    where: { sportCode: competitionSportCode, name: `${competitionSportCode}-v1`, status: 'ACTIVE' },
    orderBy: { version: 'desc' },
    select: { id: true },
  });
}

export async function readTeamMatchCompetitionConfig(tx: Prisma.TransactionClient, id: string) {
  const row = await tx.v1CompetitionConfigVersion.findUnique({ where: { id } });
  if (!row) throw new ConflictException({ code: 'COMPETITION_CONFIG_REQUIRED', message: '연결된 경기 설정 버전을 찾을 수 없어요.' });
  const config = validateCompetitionConfig({
    periods: row.periods, events: row.events, lineup: row.lineup,
    result: row.result, tieBreak: row.tieBreak, visibility: row.visibility,
  }, { preserveMissingCatalogKeys: true });
  return { id: row.id, sportCode: row.sportCode, status: row.status, config };
}

type RuleDefaults = {
  current: Awaited<ReturnType<typeof readTeamMatchCompetitionConfig>> | null;
  blockedReason: 'COMPETITION_CONFIG_REQUIRED' | 'COMPETITION_PERIODS_UNAVAILABLE' | null;
};

type CompetitionPeriods = Awaited<ReturnType<typeof readTeamMatchCompetitionConfig>>['config']['periods'];

function hasStandardHalves(periods: CompetitionPeriods): boolean {
  return periods.length === 2 && periods[0]?.code === 'FIRST_HALF' && periods[1]?.code === 'SECOND_HALF' && periods.every(period => !period.extraTime);
}

export async function readTeamMatchRuleDefaults(tx: Prisma.TransactionClient, sportId: string): Promise<RuleDefaults> {
  const pin = await resolveTeamMatchCompetitionConfig(tx, sportId);
  if (!pin) return { current: null, blockedReason: 'COMPETITION_CONFIG_REQUIRED' };
  const current = await readTeamMatchCompetitionConfig(tx, pin.id);
  if (current.status !== 'ACTIVE') return { current: null, blockedReason: 'COMPETITION_CONFIG_REQUIRED' };
  const periods = current.config.periods;
  const singlePeriod = periods.length === 1 && periods[0]?.code === 'SINGLE_PERIOD' && !periods[0].extraTime;
  if (!singlePeriod && !hasStandardHalves(periods)) {
    return { current: null, blockedReason: 'COMPETITION_PERIODS_UNAVAILABLE' };
  }
  return { current, blockedReason: null };
}

export async function readTeamMatchTwoPeriodDefaults(tx: Prisma.TransactionClient, defaults: NonNullable<RuleDefaults['current']>): Promise<CompetitionPeriods | null> {
  if (hasStandardHalves(defaults.config.periods)) return defaults.config.periods;
  let beforeVersion: number | undefined;
  // Period identities come from the active sport lineage, including a two-half version before a legal single-period save.
  for (;;) {
    const versions = await tx.v1CompetitionConfigVersion.findMany({
      where: { sportCode: defaults.sportCode, name: `${defaults.sportCode}-v1`, status: 'ACTIVE', ...(beforeVersion === undefined ? {} : { version: { lt: beforeVersion } }) },
      orderBy: { version: 'desc' }, take: 20,
    });
    for (const row of versions) {
      const config = validateCompetitionConfig({
        periods: row.periods, events: row.events, lineup: row.lineup,
        result: row.result, tieBreak: row.tieBreak, visibility: row.visibility,
      }, { preserveMissingCatalogKeys: true });
      if (hasStandardHalves(config.periods)) return config.periods;
    }
    const oldest = versions.at(-1);
    if (versions.length < 20 || !oldest) return null;
    beforeVersion = oldest.version;
  }
}

type TeamMatchPeriodConfigInput = {
  sportId: string;
  currentConfigVersionId: string;
  periods: readonly { durationMinutes: number }[];
  actorUserId: string;
};

export async function resolveTeamMatchPeriodConfig(tx: Prisma.TransactionClient, input: TeamMatchPeriodConfigInput) {
  if (!Array.isArray(input.periods) || input.periods.length < 1 || input.periods.length > 2 || input.periods.some(period =>
    !period || Array.isArray(period) || typeof period.durationMinutes !== 'number' || !Number.isInteger(period.durationMinutes) || period.durationMinutes < 1 || period.durationMinutes > MAX_TEAM_MATCH_PERIOD_MINUTES,
  )) throw new UnprocessableEntityException({ code: 'TEAM_MATCH_PERIODS_INVALID', message: '경기는 단판 또는 전후반으로 구성하고 각 시간은 양의 정수로 입력해 주세요.' });
  const defaultRead = await readTeamMatchRuleDefaults(tx, input.sportId);
  if (!defaultRead.current) throw new ConflictException({ code: defaultRead.blockedReason, message: '이 종목에 단판·전후반으로 변경할 수 있는 활성 경기 설정이 필요해요.' });
  const current = await readTeamMatchCompetitionConfig(tx, input.currentConfigVersionId);
  const defaults = defaultRead.current;
  if (current.status !== 'ACTIVE' || defaults.status !== 'ACTIVE' || current.sportCode !== defaults.sportCode) {
    throw new ConflictException({ code: 'COMPETITION_CONFIG_REQUIRED', message: '현재 종목의 활성 경기 설정만 변경할 수 있어요.' });
  }
  const expandingSinglePeriod = current.config.periods.length === 1 && current.config.periods[0]?.code === 'SINGLE_PERIOD' && input.periods.length === 2;
  const identities = expandingSinglePeriod ? await readTeamMatchTwoPeriodDefaults(tx, defaults) : current.config.periods;
  if (!identities) {
    throw new ConflictException({ code: 'COMPETITION_PERIODS_UNAVAILABLE', message: '현재 종목의 전후반 경기 구성이 없어요.' });
  }
  const config = { ...current.config, periods: normalizeCompetitionPeriods(identities, input.periods) };
  const contentHash = competitionConfigContentHash(config);
  if (contentHash === competitionConfigContentHash(current.config)) return { id: current.id, config };

  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`team-match-rules:content:${contentHash}`}, 0))`;
  const existing = await tx.v1CompetitionConfigVersion.findUnique({ where: { contentHash } });
  if (existing) return reusablePeriodConfig(existing, current.sportCode, config);
  const name = `${current.sportCode}-team-match-rules-v1`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`team-match-rules:lineage:${current.sportCode}:${name}`}, 0))`;
  const latest = await tx.v1CompetitionConfigVersion.findFirst({ where: { sportCode: current.sportCode, name }, orderBy: { version: 'desc' }, select: { version: true } });
  // ON CONFLICT also handles an identical version concurrently published outside this host flow.
  await tx.v1CompetitionConfigVersion.createMany({ data: [{
    id: randomUUID(), sportCode: current.sportCode, name, version: (latest?.version ?? 0) + 1,
    status: 'ACTIVE', createdByUserId: input.actorUserId, contentHash,
    periods: config.periods, events: config.events, lineup: config.lineup,
    result: config.result, tieBreak: config.tieBreak, visibility: config.visibility,
  }], skipDuplicates: true });
  const published = await tx.v1CompetitionConfigVersion.findUnique({ where: { contentHash } });
  if (!published) throw new ConflictException({ code: 'TEAM_MATCH_RULES_RETRYABLE', message: '경기 설정이 동시에 변경됐어요. 최신 내용을 다시 확인하고 저장해 주세요.' });
  return reusablePeriodConfig(published, current.sportCode, config);
}

function reusablePeriodConfig(
  row: Pick<V1CompetitionConfigVersion, 'id' | 'sportCode' | 'status' | 'periods' | 'events' | 'lineup' | 'result' | 'tieBreak' | 'visibility'>,
  sportCode: string,
  config: Awaited<ReturnType<typeof readTeamMatchCompetitionConfig>>['config'],
) {
  if (!isReusableCompetitionPeriodConfig(row, sportCode, config)) {
    throw new ConflictException({ code: 'COMPETITION_CONFIG_CONTENT_HASH_COLLISION', message: '동일한 해시의 설정이 다른 종목·비활성 버전이거나 실제 내용이 달라 재사용할 수 없어요.' });
  }
  return { id: row.id, config };
}
