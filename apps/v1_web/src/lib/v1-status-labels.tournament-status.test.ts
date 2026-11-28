import { describe, expect, it } from 'vitest';
import type { V1TournamentStatus } from '@/types/api';
import { tournamentStatusLabel } from './v1-status-labels';

describe('tournamentStatusLabel — 대회 상태 이름의 단일 소스', () => {
  it.each([
    ['draft', '초안'],
    ['open', '접수 중'],
    ['closed', '접수 마감'],
    ['in_progress', '진행 중'],
    ['completed', '완료'],
    ['cancelled', '취소됨'],
  ] as [V1TournamentStatus, string][])('%s → %s', (status, label) => {
    expect(tournamentStatusLabel(status)).toBe(label);
  });
});
