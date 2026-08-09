import { FOOTBALL_V1_CONFIG, FUTSAL_V1_CONFIG } from './competition-config.presets';
import { CompetitionConfig } from './competition-config.types';

/**
 * "출전 인원"(경기장에 서는 라인업 상한, `CompetitionConfig.lineup.maxPlayers`) 을 관리자가
 * 대회별로 고르게 하는 기능의 순수 계산 계층. Prisma/Nest 의존 없이 단독 테스트 가능하다
 * (barrel처럼 이 파일도 Nest 데코레이터를 전혀 쓰지 않는다).
 *
 * `V1Tournament.minPlayers/maxPlayers`(대회 "등록" 로스터 크기, 성별 쿼터가 묶이는 값)와는
 * 완전히 다른 개념이다 — 절대 섞지 않는다. 여기서 다루는 값은 오직
 * `V1CompetitionConfigVersion.lineup.{minPlayers,maxPlayers}`(경기 "출전" 라인업 상한)뿐이다.
 */

const CANONICAL_CONFIG_BY_SPORT_CODE: Readonly<Record<string, CompetitionConfig>> = {
  football: FOOTBALL_V1_CONFIG,
  futsal: FUTSAL_V1_CONFIG,
};

/**
 * 이미 `normalizeCompetitionSportCode()`로 정규화된(football|futsal) sportCode 전용.
 * 정규화되지 않은 원시 문자열을 여기 직접 넣지 말 것 — 호출부는 항상
 * `normalizeCompetitionSportCode()`를 먼저 거친다(competition-config.ts).
 */
export function canonicalCompetitionConfigForSport(normalizedSportCode: string): CompetitionConfig {
  const config = CANONICAL_CONFIG_BY_SPORT_CODE[normalizedSportCode];
  if (!config) {
    // normalizeCompetitionSportCode()가 이미 football/futsal 두 값만 통과시키므로
    // 이 분기는 그 두 프리셋이 실제로 존재한다는 불변식이 깨졌을 때만 닿는다 — 즉
    // 이 파일과 competition-config.presets.ts가 서로 어긋난 방어적 상황이다.
    throw new Error(`No canonical competition-config preset registered for sportCode "${normalizedSportCode}"`);
  }
  return config;
}

/**
 * 관리자가 고를 수 있는 "출전 인원"(GK 포함 총원) 후보값. canonical
 * `lineup.formations`가 실제로 지원하는 필드 인원수(outfield) + GK 1명에서 파생한다 —
 * 없는 대형을 지어내지 않는다(예: 축구는 아직 `formations`가 비어 있어 canonical 기본값
 * 하나만 후보가 된다). canonical `maxPlayers` 자체는 formations 데이터가 없는 종목도 최소
 * 하나의 후보를 갖도록 항상 포함한다.
 */
export function selectableLineupSizes(config: CompetitionConfig): number[] {
  const sizes = new Set<number>(config.lineup.formations.map((formation) => formation.outfield + 1));
  sizes.add(config.lineup.maxPlayers);
  return [...sizes].sort((a, b) => a - b);
}

/**
 * canonical config에서 `lineup.maxPlayers`(및 필요하면 `minPlayers`)만 n에 맞춘 새 config
 * content를 만든다. positions/formations/periods/events/result/tieBreak/visibility는
 * canonical과 완전히 동일하게 유지한다 — formations를 n에 맞춰 필터링하지 않는 것도
 * 의도적이다(실제 출전 인원이 상한보다 적을 때도 그 인원수에 맞는 대형 추천을 그대로
 * 쓸 수 있어야 한다, apps/v1_web/.../formation-slots.ts#presetsForOutfieldCount 참고).
 */
export function buildLineupSizeConfig(config: CompetitionConfig, maxPlayers: number): CompetitionConfig {
  return {
    ...config,
    lineup: {
      ...config.lineup,
      maxPlayers,
      // minPlayers > maxPlayers는 validateCompetitionConfig가 거부한다 — n을
      // canonical minPlayers보다 작게 고르는 경우를 대비해 방어적으로 clamp한다
      // (오늘은 selectableLineupSizes()가 이 경우를 만들지 않지만, 그 불변식이
      // 나중에 깨지더라도 여기서 유효한 content만 만들도록 유지한다).
      minPlayers: Math.min(config.lineup.minPlayers, maxPlayers),
    },
  };
}
