import { describe, expect, it } from 'vitest';
import type { V1GameRosterHistoryEvent } from '@/hooks/use-v1-game-roster';
import { gameRosterHistoryCaption } from './game-roster-history';

/** 서버 계약: 되돌리기에도 역할이 오고, 사이드 팀이 바뀌어 자동으로 닫힌 기록은 actor.userId 가 null·role SYSTEM. */
const revoke = (actor: V1GameRosterHistoryEvent['actor']): V1GameRosterHistoryEvent => ({
  type: 'REVOKE',
  adjustmentId: 'adj-1',
  userId: 'player-1',
  displayName: '김민재',
  reason: null,
  actor,
  at: '2026-10-01T01:00:00.000Z',
});

describe('gameRosterHistoryCaption', () => {
  it('운영자가 되돌린 기록은 "운영자 이름"으로 보인다', () => {
    expect(gameRosterHistoryCaption(revoke({ userId: 'admin-1', displayName: '박운영', role: 'ADMIN' }))).toMatch(/· 운영자 박운영$/);
  });

  it('대진이 바뀌어 자동으로 되돌린 기록은 서버 표시 이름 대신 "자동"만', () => {
    const caption = gameRosterHistoryCaption(revoke({ userId: null, displayName: '시스템', role: 'SYSTEM' }));
    expect(caption).toMatch(/· 자동$/);
    expect(caption).not.toContain('시스템');
  });

  it('역할을 모르는 옛 기록은 이름만', () => {
    expect(gameRosterHistoryCaption(revoke({ userId: 'u-1', displayName: '김팀장', role: null }))).toMatch(/· 김팀장$/);
  });
});
