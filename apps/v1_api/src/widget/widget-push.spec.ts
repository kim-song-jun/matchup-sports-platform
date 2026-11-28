import { liveActivityContentState, liveActivityDismissalSeconds, liveStateHash } from './widget-push';
import type { WidgetLiveGame } from './widget-home.service';

const game = (patch: Partial<WidgetLiveGame> = {}): WidgetLiveGame => ({
  gameId: 'g1', teamId: 't1', teamName: '한강 로버스', teamLogoUrl: '/images/team-logos/team-logo-01.jpg', title: '경기',
  opponentName: '마포', opponentLogoUrl: null, competitionName: null, venueName: '한강 구장', competitionKind: 'FRIENDLY',
  state: 'LIVE', startedAt: new Date('2026-11-27T10:00:00Z'), endedAt: null, score: { mine: 1, opponent: 0 }, penalties: null,
  period: { number: 1, phase: 'RUNNING', startedAt: new Date('2026-11-27T10:00:00Z'), pausedMs: 0, pausedAt: null, restStartedAt: null },
  scorers: [], ...patch,
});

describe('위젯 푸시 계산', () => {
  it('카드 상태에는 득점자 목록이 없고, 종료 시각은 밀리초다', () => {
    const ended = game({ state: 'ENDED', endedAt: new Date('2026-11-27T11:00:00Z'), scorers: [{ side: 'MINE', name: '김', minute: 3, ownGoal: false }] });
    const state = liveActivityContentState(ended, new Date('2026-11-27T11:01:00Z'));
    expect(state).not.toHaveProperty('scorers');
    expect(state).toMatchObject({ gameId: 'g1', state: 'ENDED', endedAt: Date.parse('2026-11-27T11:00:00Z'), updatedAt: Date.parse('2026-11-27T11:01:00Z') });
  });

  it('지문은 득점·구간·종료가 바뀌면 달라지고 득점자 이름이 바뀌어서는 달라지지 않는다', () => {
    const base = liveStateHash(game());
    expect(liveStateHash(game())).toBe(base);
    expect(liveStateHash(game({ score: { mine: 2, opponent: 0 } }))).not.toBe(base);
    expect(liveStateHash(game({ period: { number: 2, phase: 'RUNNING', startedAt: new Date('2026-11-27T10:30:00Z'), pausedMs: 0, pausedAt: null, restStartedAt: null } }))).not.toBe(base);
    expect(liveStateHash(game({ state: 'PAUSED' }))).not.toBe(base);
    expect(liveStateHash(game({ state: 'ENDED', endedAt: new Date('2026-11-27T11:00:00Z') }))).not.toBe(base);
    expect(liveStateHash(game({ scorers: [{ side: 'MINE', name: '김', minute: 3, ownGoal: false }] }))).toBe(base);
  });

  it('종료 푸시의 정리 시각은 종료 시각 + 15분(초), 모르면 지금 + 15분', () => {
    const now = new Date('2026-11-27T11:05:00Z');
    expect(liveActivityDismissalSeconds(game({ endedAt: new Date('2026-11-27T11:00:00Z') }), now)).toBe(Date.parse('2026-11-27T11:15:00Z') / 1000);
    expect(liveActivityDismissalSeconds(game(), now)).toBe(Date.parse('2026-11-27T11:20:00Z') / 1000);
  });
});
