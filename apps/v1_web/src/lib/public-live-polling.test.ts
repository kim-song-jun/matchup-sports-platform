import { describe, expect, it } from 'vitest';
import {
  PRESTART_POLL_GRACE_MS,
  PRESTART_POLL_WINDOW_MS,
  PUBLIC_LIVE_POLL_INTERVAL_MS,
  earliestPublicLivePollDelay,
  leagueFixturesPollDelay,
  publicLivePollDelay,
} from './public-live-polling';

const start = Date.parse('2026-10-10T10:00:00.000Z');
const at = (offsetMs: number) => start + offsetMs;
const scheduledAt = new Date(start).toISOString();

describe('publicLivePollDelay — 경기 시작 전에 열어 둔 화면도 시작을 스스로 발견한다', () => {
  it('진행 중이면 라이브 주기다', () => {
    expect(publicLivePollDelay('live', null, at(0))).toBe(PUBLIC_LIVE_POLL_INTERVAL_MS);
  });

  it('시작 15분 전부터 예정 시각 3시간 뒤까지는 시작 전이어도 라이브 주기로 묻는다', () => {
    expect(publicLivePollDelay('scheduled', scheduledAt, at(-PRESTART_POLL_WINDOW_MS))).toBe(PUBLIC_LIVE_POLL_INTERVAL_MS);
    expect(publicLivePollDelay('scheduled', scheduledAt, at(5 * 60_000))).toBe(PUBLIC_LIVE_POLL_INTERVAL_MS);
    expect(publicLivePollDelay('scheduled', scheduledAt, at(PRESTART_POLL_GRACE_MS))).toBe(PUBLIC_LIVE_POLL_INTERVAL_MS);
  });

  it('창이 아직 멀면 창이 열릴 때(최대 15분 간격) 다시 확인한다 — false 면 다시 묻지 않기 때문이다', () => {
    expect(publicLivePollDelay('scheduled', scheduledAt, at(-PRESTART_POLL_WINDOW_MS - 60_000))).toBe(60_000);
    expect(publicLivePollDelay('scheduled', scheduledAt, at(-24 * 60 * 60_000))).toBe(15 * 60_000);
  });

  it.each([1, 1_000, 9_999])('창이 열리기 %ims 전에도 공개 조회의 10초 하한을 지킨다', (remainingMs) => {
    const now = at(-PRESTART_POLL_WINDOW_MS - remainingMs);
    expect(publicLivePollDelay('scheduled', scheduledAt, now)).toBe(PUBLIC_LIVE_POLL_INTERVAL_MS);
    expect(earliestPublicLivePollDelay([{ status: 'scheduled', scheduledAt }], now))
      .toBe(PUBLIC_LIVE_POLL_INTERVAL_MS);
  });

  it('끝났거나 시각이 없거나 너무 오래 시작하지 않은 경기는 멈춘다', () => {
    expect(publicLivePollDelay('ended', scheduledAt, at(0))).toBe(false);
    expect(publicLivePollDelay('cancelled', scheduledAt, at(0))).toBe(false);
    expect(publicLivePollDelay('scheduled', null, at(0))).toBe(false);
    expect(publicLivePollDelay('scheduled', scheduledAt, at(PRESTART_POLL_GRACE_MS + 1))).toBe(false);
  });

  it('여러 경기 중 가장 먼저 필요한 폴링에 맞춘다', () => {
    expect(earliestPublicLivePollDelay([
      { status: 'ended', scheduledAt },
      { status: 'scheduled', scheduledAt: new Date(at(20 * 60_000)).toISOString() },
    ], at(0))).toBe(5 * 60_000);
    expect(earliestPublicLivePollDelay([{ status: 'ended', scheduledAt }], at(0))).toBe(false);
  });
});

describe('leagueFixturesPollDelay — 공개 리그 상세가 종료·확정을 새로고침 없이 받는다 (MD-QA #149)', () => {
  const past = new Date(at(-24 * 60 * 60_000)).toISOString();
  const fixture = (patch: Record<string, unknown>) =>
    ({ status: 'matched', startAt: past, homeScore: null, awayScore: null, gameState: null, ...patch }) as Parameters<typeof leagueFixturesPollDelay>[0][number];

  it('진행 중·일시 중지·결과 대기(끝났지만 확정 전) 경기가 있으면 라이브 주기다', () => {
    expect(leagueFixturesPollDelay([fixture({ gameState: 'LIVE' })], at(0))).toBe(PUBLIC_LIVE_POLL_INTERVAL_MS);
    expect(leagueFixturesPollDelay([fixture({ gameState: 'PAUSED' })], at(0))).toBe(PUBLIC_LIVE_POLL_INTERVAL_MS);
    expect(leagueFixturesPollDelay([fixture({ gameState: 'ENDED' })], at(0))).toBe(PUBLIC_LIVE_POLL_INTERVAL_MS);
  });

  it('확정·무효·가려진 결과와 취소 경기만 남으면 멈춘다', () => {
    expect(leagueFixturesPollDelay([
      fixture({ gameState: 'ENDED', homeScore: 1, awayScore: 0 }),
      fixture({ gameState: 'ENDED', resultVoided: true }),
      fixture({ gameState: 'ENDED', scoreHidden: true }),
      fixture({ status: 'cancelled' }),
    ], at(0))).toBe(false);
  });

  it('시작 전 경기는 킥오프 창을 따르고, 하루 전에 지난 미시작 경기는 묻지 않는다', () => {
    expect(leagueFixturesPollDelay([fixture({ gameState: 'SCHEDULED', startAt: scheduledAt })], at(0))).toBe(PUBLIC_LIVE_POLL_INTERVAL_MS);
    expect(leagueFixturesPollDelay([fixture({ gameState: 'SCHEDULED' })], at(0))).toBe(false);
  });
});
