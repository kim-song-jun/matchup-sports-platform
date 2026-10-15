import { UnprocessableEntityException } from '@nestjs/common';
import type { CompetitionConfig } from './competition-config.types';

export function normalizeCompetitionPeriods(
  current: readonly CompetitionConfig['periods'][number][],
  requested: readonly { durationMinutes: number }[],
): CompetitionConfig['periods'] {
  if (requested.length === 0) {
    throw new UnprocessableEntityException({ code: 'TOURNAMENT_PERIODS_REQUIRED', message: '피리어드는 하나 이상 필요해요.' });
  }
  const usedCodes = new Set(current.map((period) => period.code));
  if (usedCodes.size !== current.length) {
    throw new UnprocessableEntityException({
      code: 'COMPETITION_PERIODS_UNAVAILABLE',
      message: '현재 대회의 피리어드 코드가 중복돼 있어요. 먼저 유효한 경기 설정 버전을 연결해 주세요.',
    });
  }
  const shrinkingStandardHalves = requested.length === 1 && current.length >= 2 && current[0]?.code === 'FIRST_HALF' && current[1]?.code === 'SECOND_HALF';
  return requested.map((period, index) => {
    const previous = current[index];
    let code = previous?.code;
    if (!code) {
      let suffix = index + 1;
      code = `PERIOD_${suffix}`;
      while (usedCodes.has(code)) code = `PERIOD_${++suffix}`;
      usedCodes.add(code);
    }
    return {
      code: shrinkingStandardHalves ? 'SINGLE_PERIOD' : code,
      label: shrinkingStandardHalves ? '단일' : (previous?.label ?? `${index + 1}피리어드`),
      durationMinutes: period.durationMinutes,
      extraTime: previous?.extraTime ?? false,
    };
  });
}
