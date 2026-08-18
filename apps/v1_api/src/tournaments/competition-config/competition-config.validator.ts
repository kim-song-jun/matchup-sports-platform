import { createHash } from 'node:crypto';
import { UnprocessableEntityException } from '@nestjs/common';
import { REQUIRED_TIE_BREAK_ORDER } from './competition-config.presets';
import {
  COMPETITION_CONFIG_CODES,
  CompetitionConfig,
} from './competition-config.types';

/**
 * `normalizeCompetitionSportCode()`의 non-throwing 짝 — "이 sportCode가 경기 설정
 * 카탈로그에 있는지"를 확인만 하고 싶은 호출부(예: 아직 지원하지 않는 종목이면 그
 * 종목의 대회는 competitionConfigVersionId를 그냥 null로 두는 TournamentsAdminService,
 * 또는 관리자 화면에 "이 종목은 출전 인원 설정을 아직 지원하지 않아요"를 보여줘야 하는
 * lineup-size-options 조회)가 이 값을 쓴다. 두 함수가 문자열 매칭을 각자 따로 하면
 * 종목을 하나 늘릴 때 한쪽만 고치는 드리프트가 생기므로, 매칭 로직은 여기 하나뿐이다.
 */
export function tryNormalizeCompetitionSportCode(
  value: string | null | undefined,
): 'football' | 'futsal' | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'soccer' || normalized === 'football') return 'football';
  if (normalized === 'futsal') return 'futsal';
  return null;
}

export function normalizeCompetitionSportCode(value: string | null | undefined) {
  if (!value) {
    throw new UnprocessableEntityException({
      code: COMPETITION_CONFIG_CODES.MISSING_SPORT,
      message: '경기 설정에 사용할 종목이 필요해요.',
    });
  }
  const normalized = tryNormalizeCompetitionSportCode(value);
  if (normalized === null) {
    throw new UnprocessableEntityException({
      code: COMPETITION_CONFIG_CODES.UNSUPPORTED_SPORT,
      message: `지원하지 않는 경기 설정 종목이에요: ${value}`,
    });
  }
  return normalized;
}

function invalidConfig(message: string): never {
  throw new UnprocessableEntityException({
    code: COMPETITION_CONFIG_CODES.INVALID,
    message,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function validateCompetitionConfig(value: unknown): CompetitionConfig {
  if (!isRecord(value)) invalidConfig('경기 설정은 객체여야 해요.');
  const periods = value.periods;
  if (
    !Array.isArray(periods) ||
    periods.length === 0 ||
    periods.some(
      (period) =>
        !isRecord(period) ||
        typeof period.code !== 'string' ||
        typeof period.label !== 'string' ||
        !Number.isInteger(period.durationMinutes) ||
        Number(period.durationMinutes) <= 0 ||
        typeof period.extraTime !== 'boolean',
    )
  ) {
    invalidConfig('periods에는 유효한 경기 시간 구성이 필요해요.');
  }
  if (
    !Array.isArray(value.events) ||
    value.events.length === 0 ||
    value.events.some((event) => typeof event !== 'string') ||
    !value.events.includes('GOAL')
  ) {
    invalidConfig('events에는 GOAL을 포함한 이벤트 목록이 필요해요.');
  }
  const lineup = value.lineup;
  if (
    !isRecord(lineup) ||
    !Number.isInteger(lineup.minPlayers) ||
    !Number.isInteger(lineup.maxPlayers) ||
    Number(lineup.minPlayers) < 1 ||
    Number(lineup.minPlayers) > Number(lineup.maxPlayers) ||
    !['limited', 'rolling'].includes(String(lineup.substitutions)) ||
    (lineup.maxSubstitutions !== null &&
      (!Number.isInteger(lineup.maxSubstitutions) || Number(lineup.maxSubstitutions) < 0))
  ) {
    invalidConfig('lineup의 인원 또는 교체 규칙이 올바르지 않아요.');
  }
  // T1-5 added `positions`/`formations` to lineup — `validateCompetitionConfig`
  // is not only a write-time guard (competition-config-registry.ts) but is
  // also re-run against already-stored rows on read paths (e.g.
  // tournament-bracket.service.ts#recalculateStandings re-validates the
  // tournament's active config version). A stored row from before T1-5
  // simply has no `positions`/`formations` key at all — that must not throw
  // here and break standings recalculation for tournaments created earlier;
  // it degrades to the same "no formation catalog" state
  // parseLineupCatalog() already treats as normal. A key that IS present but
  // malformed is a genuine validation failure (covers new/edited writes,
  // which always go through competition-config.presets.ts and therefore
  // always include both keys).
  const positionsProvided = isRecord(lineup) && lineup.positions !== undefined;
  const positions = positionsProvided ? lineup.positions : [];
  if (
    positionsProvided &&
    (
      !Array.isArray(positions) ||
      positions.length === 0 ||
      positions.some(
        (position) =>
          !isRecord(position) ||
          typeof position.code !== 'string' ||
          position.code.length === 0 ||
          typeof position.label !== 'string' ||
          position.label.length === 0 ||
          typeof position.short !== 'string' ||
          position.short.length === 0 ||
          (position.goalkeeper !== undefined && position.goalkeeper !== true),
      ) ||
      positions.filter((position) => isRecord(position) && position.goalkeeper === true).length !== 1
    )
  ) {
    invalidConfig('lineup.positions에는 골키퍼 하나를 포함한 포지션 사전이 필요해요.');
  }
  const positionCodes = new Set(
    (positions as Array<{ code: string; goalkeeper?: boolean }>)
      .filter((position) => position.goalkeeper !== true)
      .map((position) => position.code),
  );

  const formationsProvided = isRecord(lineup) && lineup.formations !== undefined;
  const formations = formationsProvided ? lineup.formations : [];
  if (
    formationsProvided &&
    (
      !Array.isArray(formations) ||
      formations.some(
        (formation) =>
          !isRecord(formation) ||
          typeof formation.code !== 'string' ||
          formation.code.length === 0 ||
          typeof formation.label !== 'string' ||
          formation.label.length === 0 ||
          !Number.isInteger(formation.outfield) ||
          Number(formation.outfield) <= 0 ||
          !Array.isArray(formation.slots) ||
          formation.slots.length !== formation.outfield ||
          formation.slots.some(
            (slot) =>
              !isRecord(slot) ||
              typeof slot.position !== 'string' ||
              !positionCodes.has(slot.position) ||
              typeof slot.x !== 'number' ||
              slot.x < 0 ||
              slot.x > 100 ||
              typeof slot.y !== 'number' ||
              slot.y < 0 ||
              slot.y > 100,
          ),
      )
    )
  ) {
    invalidConfig('lineup.formations의 슬롯 구성이 올바르지 않아요.');
  }

  const result = value.result;
  if (
    !isRecord(result) ||
    !['required', 'optional'].includes(String(result.tournamentScorerPolicy)) ||
    result.teamMatchScorerPolicy !== 'optional_with_warning' ||
    result.mvpMin !== 0 ||
    result.mvpMax !== 1
  ) {
    invalidConfig('result의 득점자 또는 MVP 규칙이 올바르지 않아요.');
  }
  // `result.penaltyShootout`은 canonical 프리셋에 없는 optional 키다(프리셋을 건드리면
  // contentHash가 드리프트해 백필 CLI와 version-in-use 트리거에 걸린다 —
  // `competition-config.types.ts` 참고). 그래서 위 positions/formations와 **같은 패턴**으로
  // "있을 때만" 검사한다: 저장된 모든 기존 row에는 이 키가 없고, 이 함수는 쓰기 게이트일
  // 뿐 아니라 읽기 경로에서 저장된 row에 다시 돌기도 하므로 키 부재로 던지면 기존 대회의
  // 순위 재계산이 통째로 깨진다. 반대로 키가 **있는데** 모양이 틀린 것은 진짜 검증 실패다.
  const penaltyShootoutProvided = isRecord(result) && result.penaltyShootout !== undefined;
  if (
    penaltyShootoutProvided &&
    (!isRecord(result.penaltyShootout) || typeof result.penaltyShootout.earlyStop !== 'boolean')
  ) {
    invalidConfig('result.penaltyShootout.earlyStop은 true 또는 false여야 해요.');
  }
  const tieBreak = value.tieBreak;
  const points = isRecord(tieBreak) ? tieBreak.points : null;
  if (
    !isRecord(tieBreak) ||
    !isRecord(points) ||
    ![points.win, points.draw, points.loss].every(
      (point) => typeof point === 'number' && Number.isFinite(point),
    ) ||
    !Array.isArray(tieBreak.order) ||
    tieBreak.order.length !== REQUIRED_TIE_BREAK_ORDER.length ||
    tieBreak.order.some((item, index) => item !== REQUIRED_TIE_BREAK_ORDER[index]) ||
    tieBreak.seededDraw !== 'sha256-v1'
  ) {
    invalidConfig('tieBreak의 승점 또는 동률 결정 순서가 올바르지 않아요.');
  }
  const visibility = value.visibility;
  if (
    !isRecord(visibility) ||
    visibility.default !== 'live' ||
    !Array.isArray(visibility.allowed) ||
    visibility.allowed.length !== 2 ||
    !visibility.allowed.includes('live') ||
    !visibility.allowed.includes('official')
  ) {
    invalidConfig('visibility는 live와 official 상태를 지원해야 해요.');
  }
  // positions/formations는 legacy row에서 키 자체가 없을 수 있으므로(위 참고), 반환값은
  // 항상 CompetitionConfig 타입 계약대로 배열을 채워서 내보낸다 — 그렇지 않으면 이 함수를
  // 호출하는 쪽(tournament-bracket.service.ts 등)이 타입은 배열을 약속받았는데 런타임엔
  // undefined를 받는 모순이 생긴다.
  return {
    ...value,
    lineup: { ...(lineup as Record<string, unknown>), positions, formations },
  } as CompetitionConfig;
}

// Exported so competition-config-version-repoint.ts can diff individual
// CompetitionConfig sections (periods/events/lineup/result/tieBreak/
// visibility) between a drifted stored row and the canonical preset with the
// exact same key-order-independent equality competitionConfigContentHash()
// below already uses for the whole document, instead of re-implementing a
// second, possibly-divergent deep-equality check.
export function canonicalize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export function competitionConfigContentHash(config: CompetitionConfig) {
  return createHash('sha256').update(canonicalize(config)).digest('hex');
}
