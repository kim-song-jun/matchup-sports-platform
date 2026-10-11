import { BadRequestException } from '@nestjs/common';

// The web wizard and the admin form both serialize cost as this sentence; free-form notes are left alone.
const STRUCTURED_COST_NOTE = /^총\s*([\d,]+)원\s*·\s*상대팀\s*([\d,]+)원$/;

export function assertOpponentCostWithinTotal(costNote?: string | null) {
  const match = STRUCTURED_COST_NOTE.exec(costNote?.trim() ?? '');
  if (!match) return;
  const [total, opponent] = [match[1], match[2]].map((amount) => Number(amount.replace(/,/g, '')));
  if (opponent > total) {
    throw new BadRequestException({
      code: 'VALIDATION_FAILED',
      message: '상대팀 부담금은 총비용보다 클 수 없어요.',
      details: { field: 'costNote' },
    });
  }
}
