import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TEAM_FOUL_THRESHOLD,
  deriveFoulCounts,
  parseTeamFoulThresholdInput,
  resolveTeamFoulThreshold,
} from './team-foul-counter';
import type { GameEventRecord } from '@/types/game-operations';

function foul(id: string, sideId: string, period: number, reversesEventId: string | null = null): GameEventRecord {
  return {
    id, gameId: 'g-1', sequence: Number(id.replace('e', '')), clientEventId: id, payloadHash: 'h',
    type: 'FOUL', sideId, participantId: 'p-1', assistParticipantId: null, period, clockMs: 0,
    occurredAt: '', receivedAt: '', actorUserId: 'u-1', reversesEventId, payload: {},
  };
}

function card(
  id: string,
  sideId: string,
  participantId: string | null,
  color: 'YELLOW' | 'RED',
  period = 1,
  reversesEventId: string | null = null,
): GameEventRecord {
  return { ...foul(id, sideId, period, reversesEventId), type: 'CARD', participantId, payload: { card: color } };
}

describe('deriveFoulCounts', () => {
  it('counts FOUL events for the given period, grouped by side', () => {
    const events = [foul('e1', 's-home', 1), foul('e2', 's-home', 1), foul('e3', 's-away', 1), foul('e4', 's-home', 2)];
    expect(deriveFoulCounts(events, 1)).toEqual({ 's-home': 2, 's-away': 1 });
  });

  it('excludes a FOUL that has been reversed by a CORRECTION event', () => {
    const original = foul('e1', 's-home', 1);
    const reversal: GameEventRecord = { ...foul('e2', 's-home', 1), type: 'CORRECTION', reversesEventId: 'e1' };
    // 유일한 FOUL이 되돌려졌으므로 이 사이드는 아예 키를 갖지 않는다(0으로
    // 채워진 키가 아니라). 점수 카드 등 소비처는 항상
    // `counts[side.id] ?? 0` 으로 읽으므로 이 둘은 동치다 — 여기서는 파생
    // 함수가 실제로 만드는 값을 그대로 검증한다.
    expect(deriveFoulCounts([original, reversal], 1)).toEqual({});
  });

  it('a side with an active (non-reversed) FOUL alongside another side\'s reversed one only counts the active side', () => {
    const activeFoul = foul('e1', 's-away', 1);
    const reversedOriginal = foul('e2', 's-home', 1);
    const reversal: GameEventRecord = { ...foul('e3', 's-home', 1), type: 'CORRECTION', reversesEventId: 'e2' };
    expect(deriveFoulCounts([activeFoul, reversedOriginal, reversal], 1)).toEqual({ 's-away': 1 });
  });

  // 2026-11-18 사용자 결정: 카드(옐로·레드)도 팀 파울 1개로 센다.
  describe('카드', () => {
    it('옐로·레드카드 한 장은 파울과 같이 팀 파울 1개로 센다', () => {
      const events = [
        foul('e1', 's-home', 1),
        card('e2', 's-home', 'p-1', 'YELLOW'),
        card('e3', 's-home', 'p-2', 'RED'),
        card('e4', 's-away', 'p-3', 'YELLOW'),
      ];
      expect(deriveFoulCounts(events, 1)).toEqual({ 's-home': 3, 's-away': 1 });
    });

    it('피리어드별로 센다 — 후반 카드는 전반 숫자에 섞이지 않는다', () => {
      const events = [card('e1', 's-home', 'p-1', 'YELLOW', 1), card('e2', 's-home', 'p-2', 'YELLOW', 2)];
      expect(deriveFoulCounts(events, 1)).toEqual({ 's-home': 1 });
      expect(deriveFoulCounts(events, 2)).toEqual({ 's-home': 1 });
    });

    it('취소된 카드는 세지 않는다', () => {
      const original = card('e1', 's-home', 'p-1', 'YELLOW');
      const reversal: GameEventRecord = { ...foul('e2', 's-home', 1), type: 'CORRECTION', reversesEventId: 'e1' };
      expect(deriveFoulCounts([original, reversal], 1)).toEqual({});
    });

    it('선수가 없는 카드 이벤트도 팀 파울로 센다', () => {
      expect(deriveFoulCounts([card('e1', 's-home', null, 'YELLOW')], 1)).toEqual({ 's-home': 1 });
    });

    it('카드 색 정보가 없는 카드는 옐로로 본다 — 서버 집계와 같다', () => {
      const noColor: GameEventRecord = { ...card('e1', 's-home', 'p-1', 'YELLOW'), payload: {} };
      expect(deriveFoulCounts([noColor], 1)).toEqual({ 's-home': 1 });
    });
  });

  describe('경고 누적 퇴장', () => {
    it('같은 선수의 옐로 2장 뒤에 붙는 레드는 파울로 세지 않는다 — 옐로 2장만 센다', () => {
      const events = [
        card('e1', 's-home', 'p-1', 'YELLOW'),
        card('e2', 's-home', 'p-1', 'YELLOW'),
        card('e3', 's-home', 'p-1', 'RED'),
      ];
      expect(deriveFoulCounts(events, 1)).toEqual({ 's-home': 2 });
    });

    it('옐로가 1장뿐이거나 없는 레드(직접 퇴장)는 센다', () => {
      expect(deriveFoulCounts([card('e1', 's-home', 'p-1', 'RED')], 1)).toEqual({ 's-home': 1 });
      expect(
        deriveFoulCounts([card('e1', 's-home', 'p-1', 'YELLOW'), card('e2', 's-home', 'p-1', 'RED')], 1),
      ).toEqual({ 's-home': 2 });
    });

    it('옐로 한 장이 취소됐으면 남은 옐로가 1장이라 이어진 레드는 센다', () => {
      const events = [
        card('e1', 's-home', 'p-1', 'YELLOW'),
        card('e2', 's-home', 'p-1', 'YELLOW'),
        { ...foul('e3', 's-home', 1), type: 'CORRECTION', reversesEventId: 'e2' } as GameEventRecord,
        card('e4', 's-home', 'p-1', 'RED'),
      ];
      expect(deriveFoulCounts(events, 1)).toEqual({ 's-home': 2 });
    });

    it('다른 선수의 옐로는 합치지 않는다', () => {
      const events = [
        card('e1', 's-home', 'p-1', 'YELLOW'),
        card('e2', 's-home', 'p-2', 'YELLOW'),
        card('e3', 's-home', 'p-2', 'RED'),
      ];
      expect(deriveFoulCounts(events, 1)).toEqual({ 's-home': 3 });
    });

    it('옐로가 전반, 레드가 후반이어도 후반 숫자에서 누적 퇴장 레드는 빠진다', () => {
      const events = [
        card('e1', 's-home', 'p-1', 'YELLOW', 1),
        card('e2', 's-home', 'p-1', 'YELLOW', 2),
        card('e3', 's-home', 'p-1', 'RED', 2),
      ];
      expect(deriveFoulCounts(events, 1)).toEqual({ 's-home': 1 });
      expect(deriveFoulCounts(events, 2)).toEqual({ 's-home': 1 });
    });

    it('이벤트 순서(sequence)로 판정한다 — 배열 순서가 뒤섞여도 같다', () => {
      const events = [
        card('e3', 's-home', 'p-1', 'RED'),
        card('e1', 's-home', 'p-1', 'YELLOW'),
        card('e2', 's-home', 'p-1', 'YELLOW'),
      ];
      expect(deriveFoulCounts(events, 1)).toEqual({ 's-home': 2 });
    });
  });
});

describe('resolveTeamFoulThreshold', () => {
  it('서버가 준 값을 그대로 쓰고, 없거나 범위 밖이면 기본값(5)이다', () => {
    expect(DEFAULT_TEAM_FOUL_THRESHOLD).toBe(5);
    expect(resolveTeamFoulThreshold(3)).toBe(3);
    expect(resolveTeamFoulThreshold(20)).toBe(20);
    expect(resolveTeamFoulThreshold(null)).toBe(5);
    expect(resolveTeamFoulThreshold(undefined)).toBe(5);
    expect(resolveTeamFoulThreshold(0)).toBe(5);
    expect(resolveTeamFoulThreshold(21)).toBe(5);
    expect(resolveTeamFoulThreshold(2.5)).toBe(5);
  });
});

describe('parseTeamFoulThresholdInput', () => {
  it('빈칸은 null(기본값으로 되돌리기), 1~20 정수는 그 값이다', () => {
    expect(parseTeamFoulThresholdInput('')).toBeNull();
    expect(parseTeamFoulThresholdInput('   ')).toBeNull();
    expect(parseTeamFoulThresholdInput('1')).toBe(1);
    expect(parseTeamFoulThresholdInput(' 7 ')).toBe(7);
    expect(parseTeamFoulThresholdInput('20')).toBe(20);
  });

  it('0·21 이상·소수·음수·글자는 invalid 다', () => {
    for (const raw of ['0', '21', '3.5', '-1', 'abc', '5개', '1e1']) {
      expect(parseTeamFoulThresholdInput(raw)).toBe('invalid');
    }
  });
});
