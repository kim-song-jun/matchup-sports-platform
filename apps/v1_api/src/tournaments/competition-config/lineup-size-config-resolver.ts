import { UnprocessableEntityException } from '@nestjs/common';
import { AdminContextService } from '../../common/admin-context.service';
import { PrismaService } from '../../prisma/prisma.service';
import { V1AuthUser } from '../../auth/v1-auth-user';
import { competitionConfigContentHash } from './competition-config';
import { CompetitionConfigRegistry } from './competition-config-registry';
import { COMPETITION_CONFIG_VERSION_REPOINT_SEEDS } from './competition-config-version-repoint';
import { buildLineupSizeConfig, canonicalCompetitionConfigForSport, selectableLineupSizes } from './lineup-size';
import { SELECTABLE_SUBSTITUTION_MODES, buildSubstitutionPolicyConfig } from './substitution-policy';
import { CompetitionConfig } from './competition-config.types';

/**
 * 관리자가 대회에서 고른 "출전 인원"(n) 을 실제 `V1CompetitionConfigVersion` 행으로
 * 옮기는 orchestration 계층. Prisma 스키마를 바꾸지 않는다 — 새 컬럼 대신 기존 불변
 * 버전 체계를 find-or-create로 재사용한다:
 *
 *   canonical config의 lineup.maxPlayers만 n으로 맞춘 content 구성
 *   → content_hash로 같은 (sportCode, name) 계열에 이미 그 내용의 버전이 있으면 재사용
 *   → 없으면 CompetitionConfigRegistry.createVersion()(기존 관리자 API가 이미 쓰는 경로)으로
 *     새 버전 발행
 *
 * 기존 버전 행은 절대 UPDATE하지 않는다 — DB 트리거
 * `v1_block_used_config_mutation()`이 사용 중인 버전의 수정을 막는 이유(완료된 경기의
 * 채점 규칙 소급 변경 금지)와 같은 이유로, 이 클래스도 항상 새 행을 find-or-create할 뿐
 * 기존 행을 고치지 않는다.
 */
export class LineupSizeConfigResolver {
  constructor(
    private readonly prisma: PrismaService,
    private readonly adminContext: AdminContextService,
  ) {}

  /** 이 sportCode(정규화 전)에서 관리자가 고를 수 있는 출전 인원 후보 목록. */
  selectableLineupSizesForSportCode(normalizedSportCode: string): number[] {
    return selectableLineupSizes(canonicalCompetitionConfigForSport(normalizedSportCode));
  }

  /** 관리자가 고를 수 있는 교체 방식(제한/무제한) — 모든 종목 공통(substitution-policy.ts 참고). */
  selectableSubstitutionModes(): ReadonlyArray<CompetitionConfig['lineup']['substitutions']> {
    return SELECTABLE_SUBSTITUTION_MODES;
  }

  /**
   * n(출전 인원, GK 포함)에 해당하는 `V1CompetitionConfigVersion` 행을 find-or-create한다.
   * `resolveVersionForLineupConfig()`의 얇은 래퍼 — 교체 정책은 건드리지 않고 canonical
   * 기본값을 그대로 유지한다(이전 동작과 동일). `maxPlayers`를 생략하면 canonical
   * 기본값(football 11명/futsal 6명)을 그대로 쓴다.
   */
  async resolveVersionForLineupSize(
    user: V1AuthUser,
    normalizedSportCode: string,
    maxPlayers?: number,
  ): Promise<{ id: string; version: number; contentHash: string }> {
    return this.resolveVersionForLineupConfig(user, normalizedSportCode, { maxPlayers });
  }

  /**
   * "출전 인원"과 "교체 방식/횟수"를 한 번에 override해 `V1CompetitionConfigVersion` 행을
   * find-or-create한다. 두 설정 모두 같은 `lineup` 섹션에 있고 content_hash는 config
   * 전체를 해시하므로, 각각 따로 resolve하면 한쪽이 다른 쪽을 canonical 값으로 되돌려버린다
   * — 그래서 호출부(TournamentsAdminService)는 "지금 바뀌지 않는 필드"도 현재 pin된 값을
   * 명시적으로 넘겨야 한다(생략 = canonical 기본값, "생략 = 기존 값 유지"가 아니다).
   *
   * `normalizedSportCode`는 `normalizeCompetitionSportCode()`를 이미 거친 값이어야 한다 —
   * 호출부가 어떤 예외(MISSING_SPORT/UNSUPPORTED_SPORT)를 관리자에게 보여줄지 스스로
   * 결정할 수 있도록 정규화 자체는 이 클래스가 하지 않는다.
   */
  async resolveVersionForLineupConfig(
    user: V1AuthUser,
    normalizedSportCode: string,
    overrides: {
      maxPlayers?: number;
      substitutionMode?: CompetitionConfig['lineup']['substitutions'];
      maxSubstitutions?: number | null;
    },
  ): Promise<{ id: string; version: number; contentHash: string }> {
    const canonical = canonicalCompetitionConfigForSport(normalizedSportCode);
    const options = selectableLineupSizes(canonical);
    const targetMaxPlayers = overrides.maxPlayers ?? canonical.lineup.maxPlayers;
    if (!options.includes(targetMaxPlayers)) {
      throw new UnprocessableEntityException({
        code: 'LINEUP_SIZE_UNSUPPORTED',
        message: `이 종목에서 선택할 수 있는 출전 인원은 ${options.join('명/')}명이에요.`,
      });
    }

    const targetMode = overrides.substitutionMode ?? canonical.lineup.substitutions;
    let targetMaxSubstitutions: number | null;
    if (targetMode === 'rolling') {
      // 무제한은 항상 null — 아래 buildSubstitutionPolicyConfig도 같은 강제를 하지만,
      // 이 분기 자체가 없으면 바로 다음 "제한인데 개수가 없다" 에러가 무제한 요청에도
      // 잘못 발화한다.
      targetMaxSubstitutions = null;
    } else if (overrides.maxSubstitutions !== undefined) {
      targetMaxSubstitutions = overrides.maxSubstitutions;
    } else if (canonical.lineup.substitutions === 'limited') {
      // 개수를 안 줬지만 canonical 자체가 제한형이면(football) 그 기본 횟수를 쓴다.
      targetMaxSubstitutions = canonical.lineup.maxSubstitutions;
    } else {
      // canonical이 무제한(futsal)인데 제한형으로 바꾸면서 개수를 안 줬다 — 라인업 인원과
      // 달리 파생시킬 실제 카탈로그가 없으므로(위 모듈 주석 참고) 지어내지 않고 명확한
      // 에러로 막는다.
      throw new UnprocessableEntityException({
        code: 'SUBSTITUTION_LIMIT_REQUIRED',
        message: '교체 횟수를 제한하려면 허용 횟수를 함께 입력해 주세요.',
      });
    }
    // 관리자가 직접 넘긴 개수(overrides.maxSubstitutions)는 DTO의
    // `@IsInt`/`@Min(0)`이 이미 정수·범위를 검증했으므로 여기서 다시 막지 않는다. 위
    // 두 분기(무제한→null, 제한+개수 없음→canonical 폴백 또는 REQUIRED 에러) 밖에서
    // targetMaxSubstitutions가 null로 남는 경우는 "pin된 레거시 설정을 그대로
    // 이어받았는데 그 레거시 값 자체가 이미 개수 없는 limited"뿐이다 — 이 코드베이스의
    // 다른 read-path들(parseLineupLimits 등)과 같은 원칙으로, 그런 레거시 상태는
    // 새로 만들어내지 않을 뿐 강제로 막지 않고 그대로 이어간다.

    const targetConfig = buildSubstitutionPolicyConfig(
      buildLineupSizeConfig(canonical, targetMaxPlayers),
      targetMode,
      targetMaxSubstitutions,
    );
    return this.findOrCreateVersion(user, normalizedSportCode, targetConfig);
  }

  /**
   * `targetConfig`의 content_hash로 `V1CompetitionConfigVersion` 행을 find-or-create한다
   * — `resolveVersionForLineupConfig()`가 만든 config content를 실제 DB 행으로 옮기는
   * 공통 꼬리 부분(이전에는 `resolveVersionForLineupSize()` 안에 인라인돼 있었다).
   */
  private async findOrCreateVersion(
    user: V1AuthUser,
    normalizedSportCode: string,
    targetConfig: CompetitionConfig,
  ): Promise<{ id: string; version: number; contentHash: string }> {
    const contentHash = competitionConfigContentHash(targetConfig);

    const seed = COMPETITION_CONFIG_VERSION_REPOINT_SEEDS.find((s) => s.sportCode === normalizedSportCode);
    if (!seed) {
      // canonicalCompetitionConfigForSport()가 성공했다는 것은 이미 football/futsal
      // 둘 중 하나라는 뜻이고, 그 둘은 COMPETITION_CONFIG_VERSION_REPOINT_SEEDS에도
      // 항상 함께 등록돼 있다(같은 두 계열) — 이 분기는 그 불변식이 깨졌을 때만 닿는다.
      throw new Error(`No competition-config repoint seed registered for sportCode "${normalizedSportCode}"`);
    }

    const existing = await this.prisma.v1CompetitionConfigVersion.findFirst({
      where: { sportCode: normalizedSportCode, name: seed.name, contentHash },
      select: { id: true, version: true, contentHash: true },
    });
    if (existing) return existing;

    const latest = await this.prisma.v1CompetitionConfigVersion.findFirst({
      where: { sportCode: normalizedSportCode, name: seed.name },
      orderBy: { version: 'desc' },
      select: { id: true },
    });
    if (!latest) {
      throw new UnprocessableEntityException({
        code: 'COMPETITION_CONFIG_NOT_FOUND',
        message: '이 종목의 경기 설정이 아직 준비되지 않았어요.',
      });
    }

    // content_hash는 (sportCode, name) 범위가 아니라 테이블 전체에서 유일하다
    // (schema.prisma) — repoint 모듈(competition-config-version-repoint.ts)이 같은
    // 이유로 두는 것과 동일한 방어. 이 검사 없이 바로 createVersion()을 호출하면
    // 우연히 다른 계열의 콘텐츠와 바이트가 같을 때 원인 불명의 유니크 제약 위반으로
    // 실패한다.
    const collision = await this.prisma.v1CompetitionConfigVersion.findUnique({
      where: { contentHash },
      select: { id: true, sportCode: true, name: true },
    });
    if (collision) {
      throw new UnprocessableEntityException({
        code: 'COMPETITION_CONFIG_CONTENT_HASH_COLLISION',
        message: '동일한 경기 설정 내용이 이미 다른 종목 계열에 존재해요. 관리자에게 문의해 주세요.',
      });
    }

    const registry = new CompetitionConfigRegistry(this.prisma, this.adminContext);
    const created = await registry.createVersion(user, latest.id, {
      config: targetConfig as unknown as Record<string, unknown>,
    });
    return { id: created.id, version: created.version, contentHash: created.contentHash };
  }
}
