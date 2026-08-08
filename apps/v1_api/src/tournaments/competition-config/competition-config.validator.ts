import { createHash } from 'node:crypto';
import { UnprocessableEntityException } from '@nestjs/common';
import { REQUIRED_TIE_BREAK_ORDER } from './competition-config.presets';
import {
  COMPETITION_CONFIG_CODES,
  CompetitionConfig,
} from './competition-config.types';

export function normalizeCompetitionSportCode(value: string | null | undefined) {
  if (!value) {
    throw new UnprocessableEntityException({
      code: COMPETITION_CONFIG_CODES.MISSING_SPORT,
      message: '경기 설정에 사용할 종목이 필요해요.',
    });
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === 'soccer' || normalized === 'football') return 'football';
  if (normalized === 'futsal') return 'futsal';
  throw new UnprocessableEntityException({
    code: COMPETITION_CONFIG_CODES.UNSUPPORTED_SPORT,
    message: `지원하지 않는 경기 설정 종목이에요: ${value}`,
  });
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

function canonicalize(value: unknown): string {
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
