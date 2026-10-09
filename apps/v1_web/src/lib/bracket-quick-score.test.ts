import { describe, expect, it } from 'vitest';
import type { V1GameResultParticipantRow, V1GameResultScore } from '@/types/api';
import {
  mergeCorrectionScore,
  needsPenalties,
  parseQuickScore,
  toCorrectionParticipants,
  type QuickScoreInputs,
} from './bracket-quick-score';

const inputs = (overrides: Partial<QuickScoreInputs> = {}): QuickScoreInputs => ({
  home: '2',
  away: '1',
  penaltyHome: '',
  penaltyAway: '',
  ...overrides,
});

describe('needsPenalties', () => {
  it('결선(녹아웃)이고 두 점수가 같을 때만 승부차기가 필요하다', () => {
    expect(needsPenalties(inputs({ home: '1', away: '1' }), true)).toBe(true);
    expect(needsPenalties(inputs({ home: '1', away: '1' }), false)).toBe(false);
    expect(needsPenalties(inputs({ home: '2', away: '1' }), true)).toBe(false);
    expect(needsPenalties(inputs({ home: '', away: '' }), true)).toBe(false);
  });
});

describe('parseQuickScore', () => {
  it('이긴 경기는 승부차기 입력이 남아 있어도 보내지 않는다', () => {
    expect(parseQuickScore(inputs({ penaltyHome: '4', penaltyAway: '3' }), true)).toEqual({ ok: true, score: { home: 2, away: 1 } });
  });

  it('조별(결선 아님) 무승부는 승부차기 없이 그대로 보낸다', () => {
    expect(parseQuickScore(inputs({ home: '1', away: '1' }), false)).toEqual({ ok: true, score: { home: 1, away: 1 } });
  });

  it('결선 무승부는 승부차기를 함께 보낸다', () => {
    expect(parseQuickScore(inputs({ home: '1', away: '1', penaltyHome: '4', penaltyAway: '3' }), true)).toEqual({
      ok: true,
      score: { home: 1, away: 1, penalties: { home: 4, away: 3 } },
    });
  });

  it.each([
    ['빈 홈 점수', { home: '' }, '홈 점수를 0 이상의 정수로 입력해 주세요.'],
    ['음수', { away: '-1' }, '어웨이 점수를 0 이상의 정수로 입력해 주세요.'],
    ['소수', { home: '1.5' }, '홈 점수를 0 이상의 정수로 입력해 주세요.'],
    ['결선 무승부인데 승부차기 없음', { home: '0', away: '0' }, '결선 경기가 무승부면 승부차기 점수를 입력해 주세요.'],
    ['결선 무승부 승부차기가 같음', { home: '0', away: '0', penaltyHome: '3', penaltyAway: '3' }, '승부차기는 승자가 갈리도록 입력해 주세요.'],
  ])('%s → 거절', (_name, overrides, error) => {
    expect(parseQuickScore(inputs(overrides), true)).toEqual({ ok: false, error });
  });
});

describe('mergeCorrectionScore', () => {
  it('승부차기 선축은 보존하고 킥 수 같은 나머지는 떨어뜨린다', () => {
    const base: V1GameResultScore = {
      home: 1,
      away: 1,
      penalties: { home: 4, away: 3, firstKickSideKey: 'AWAY', takenHome: 5, takenAway: 5 },
    };
    expect(mergeCorrectionScore(base, { home: 2, away: 2, penalties: { home: 5, away: 4 } })).toEqual({
      home: 2,
      away: 2,
      penalties: { home: 5, away: 4, firstKickSideKey: 'AWAY' },
    });
  });

  it('새 점수에 승부차기가 없으면 penalties 키 자체를 보내지 않는다', () => {
    const base: V1GameResultScore = { home: 1, away: 1, penalties: { home: 4, away: 3 } };
    const merged = mergeCorrectionScore(base, { home: 2, away: 1 });
    expect(merged).toEqual({ home: 2, away: 1 });
    expect('penalties' in merged).toBe(false);
  });

  it('백필된 중첩 형태의 기존 점수여도 던지지 않는다', () => {
    const base: V1GameResultScore = { regulation: { home: 0, away: 0 }, penalty: null, goals: [], incomplete: false };
    expect(mergeCorrectionScore(base, { home: 1, away: 0 })).toEqual({ home: 1, away: 0 });
  });
});

describe('toCorrectionParticipants', () => {
  const row = (overrides: Partial<V1GameResultParticipantRow>): V1GameResultParticipantRow => ({
    id: 'row-1',
    resultRevisionId: 'rev-1',
    participantId: 'p-1',
    sideId: 'side-home',
    started: true,
    minutesPlayed: null,
    goals: 0,
    assists: 0,
    fouls: 0,
    cards: { yellow: 0, red: 0 },
    goalkeeper: false,
    displayName: '김선수',
    jerseyNumber: 7,
    ...overrides,
  });

  it('서버 DTO 가 받는 키만 남기고 표시용 필드(id·이름·등번호)는 뺀다', () => {
    expect(toCorrectionParticipants([row({})])).toEqual([
      { participantId: 'p-1', sideId: 'side-home', started: true, goals: 0, assists: 0, fouls: 0, cards: { yellow: 0, red: 0 }, goalkeeper: false },
    ]);
  });

  it('출전 시간이 null 이면 키를 빼고, 값이 있으면 보낸다', () => {
    const [nullMinutes, withMinutes] = toCorrectionParticipants([row({}), row({ participantId: 'p-2', minutesPlayed: 90 })]);
    expect('minutesPlayed' in nullMinutes).toBe(false);
    expect(withMinutes.minutesPlayed).toBe(90);
  });
});
