import { UnprocessableEntityException } from '@nestjs/common';
import { AdminContextService } from '../../common/admin-context.service';
import { PrismaService } from '../../prisma/prisma.service';
import { V1AuthUser } from '../../auth/v1-auth-user';
import { competitionConfigContentHash } from './competition-config';
import { CompetitionConfigRegistry } from './competition-config-registry';
import { COMPETITION_CONFIG_VERSION_REPOINT_SEEDS } from './competition-config-version-repoint';
import { buildLineupSizeConfig, canonicalCompetitionConfigForSport, selectableLineupSizes } from './lineup-size';

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

  /**
   * n(출전 인원, GK 포함)에 해당하는 `V1CompetitionConfigVersion` 행을 find-or-create한다.
   * `normalizedSportCode`는 `normalizeCompetitionSportCode()`를 이미 거친 값이어야 한다 —
   * 호출부(TournamentsAdminService)가 어떤 예외(MISSING_SPORT/UNSUPPORTED_SPORT)를 관리자에게
   * 보여줄지 스스로 결정할 수 있도록 정규화 자체는 이 클래스가 하지 않는다.
   * `maxPlayers`를 생략하면 canonical 기본값(football 11명/futsal 6명)을 그대로 쓴다 —
   * 대회 생성 시 관리자가 출전 인원을 아직 안 골랐을 때의 기본 동작.
   */
  async resolveVersionForLineupSize(
    user: V1AuthUser,
    normalizedSportCode: string,
    maxPlayers?: number,
  ): Promise<{ id: string; version: number; contentHash: string }> {
    const canonical = canonicalCompetitionConfigForSport(normalizedSportCode);
    const options = selectableLineupSizes(canonical);
    const targetMaxPlayers = maxPlayers ?? canonical.lineup.maxPlayers;
    if (!options.includes(targetMaxPlayers)) {
      throw new UnprocessableEntityException({
        code: 'LINEUP_SIZE_UNSUPPORTED',
        message: `이 종목에서 선택할 수 있는 출전 인원은 ${options.join('명/')}명이에요.`,
      });
    }

    const targetConfig = buildLineupSizeConfig(canonical, targetMaxPlayers);
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
