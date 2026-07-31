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
  return value as CompetitionConfig;
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
