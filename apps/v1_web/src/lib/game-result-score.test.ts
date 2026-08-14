import { describe, expect, it } from 'vitest';
import {
  formatGameResultScore,
  formatGameResultScoreWithPenalties,
  readGameResultScore,
} from './game-result-score';
import type { V1GameResultScore } from '@/types/api';

/**
 * 알파 실측 회귀. 운영 콘솔 결과 정정 화면이 백필된 경기의 점수를
 * `undefined:undefined` 로 표시했다 — 소비처가 유니온의 평평한 쪽만 읽어서였다.
 * 같은 실수가 이 저장소에서 네 번 반복돼 포맷터를 한 곳으로 모았다.
 */
describe('readGameResultScore — 두 형태를 모두 읽는다', () => {
  it('평평한 형태 {home,away} (실시간 확정 경로)', () => {
    expect(readGameResultScore({ home: 2, away: 0 })).toEqual({ home: 2, away: 0 });
  });

  it('중첩 형태 {regulation:{home,away}} (레거시 백필 경로)', () => {
    const backfilled: V1GameResultScore = {
      regulation: { home: 3, away: 1 },
      penalty: null,
      goals: [],
      incomplete: false,
      provenance: 'TOURNAMENT_FIXTURE_RESULT',
    };
    expect(readGameResultScore(backfilled)).toEqual({ home: 3, away: 1 });
  });

  it('regulation 이 null 이면(스코어 미기록) 점수를 지어내지 않는다', () => {
    const incomplete: V1GameResultScore = {
      regulation: null,
      penalty: null,
      goals: [],
      incomplete: true,
      provenance: 'TEAM_MATCH_COMPLETION_ONLY',
    };
    expect(readGameResultScore(incomplete)).toBeNull();
  });

  it('score 가 없으면 null', () => {
    expect(readGameResultScore(null)).toBeNull();
    expect(readGameResultScore(undefined)).toBeNull();
  });
});

describe('formatGameResultScore', () => {
  it('중첩 형태도 정상 문자열로 만든다 — undefined:undefined 가 나오면 안 된다', () => {
    const backfilled: V1GameResultScore = {
      regulation: { home: 3, away: 1 },
      penalty: null,
      goals: [],
      incomplete: false,
    };
    const label = formatGameResultScore(backfilled);
    expect(label).toBe('3:1');
    expect(label).not.toContain('undefined');
  });

  it('읽을 수 없으면 fallback 을 쓴다', () => {
    expect(formatGameResultScore(null)).toBe('기록 없음');
    expect(formatGameResultScore(null, '—')).toBe('—');
  });
});

/**
 * 승부차기 병기 — 스태프 화면(운영 보드·운영 콘솔·결과 검수)이 결선 무승부 경기를
 * 정규시간 점수만으로 그리면 "0:0" 만 남아, 방금 입력한 승부차기 결과가 화면 어디에도
 * 없다(알파 실측: 결승 0:0 · 승부차기 2:0 이 서버에는 있는데 스태프 화면에 안 보였다).
 * 문구 형태는 처리 이력(`revision-timeline`)이 이미 쓰던 것을 단일 소스로 끌어올린 것이다.
 */
describe('formatGameResultScoreWithPenalties', () => {
  it('평평한 형태의 승부차기를 정규시간 점수 뒤에 병기한다', () => {
    expect(formatGameResultScoreWithPenalties({ home: 0, away: 0, penalties: { home: 2, away: 0 } })).toBe(
      '0:0 (승부차기 2:0)',
    );
  });

  it('중첩 형태의 `penalty`(단수) 도 같은 문구로 병기한다', () => {
    const backfilled: V1GameResultScore = {
      regulation: { home: 3, away: 3 },
      penalty: { home: 3, away: 0 },
      goals: [],
      incomplete: false,
      provenance: 'TOURNAMENT_FIXTURE_RESULT',
    };
    expect(formatGameResultScoreWithPenalties(backfilled)).toBe('3:3 (승부차기 3:0)');
  });

  it('승부차기가 없으면 정규시간 점수만 — 빈 괄호를 붙이지 않는다', () => {
    expect(formatGameResultScoreWithPenalties({ home: 3, away: 1 })).toBe('3:1');
  });

  it('읽을 수 없으면 fallback 을 쓴다', () => {
    expect(formatGameResultScoreWithPenalties(null)).toBe('기록 없음');
    expect(formatGameResultScoreWithPenalties(null, '—')).toBe('—');
  });
});
