import { describe, expect, it } from 'vitest';
import type { GameLineup, GameSide } from '@/types/game-operations';
import type { EventCaptureCommitInput } from './action-target-picker';
import { commandConfirmCopy, commitActionConfirmCopy } from './confirm-copy';

const sides: GameSide[] = [
  {
    id: 'side-home',
    gameId: 'game-1',
    sideKey: 'HOME',
    teamId: null,
    displayNameSnapshot: '홈팀',
    createdAt: '2026-09-30T00:00:00.000Z',
    updatedAt: '2026-09-30T00:00:00.000Z',
  },
];

function input(overrides: Pick<EventCaptureCommitInput, 'type'> & Partial<EventCaptureCommitInput>): EventCaptureCommitInput {
  return {
    sideId: 'side-home',
    period: 1,
    clockMs: 60_000,
    occurredAt: '2026-09-30T00:01:00.000Z',
    payload: {},
    ...overrides,
  };
}

describe('commitActionConfirmCopy — 받침에 맞는 조사', () => {
  it('받침 있는 골·파울은 "을", 받침 없는 옐로카드·레드카드는 "를"을 붙인다', () => {
    const title = (event: EventCaptureCommitInput) => commitActionConfirmCopy(event, sides, [], null).title;

    expect(title(input({ type: 'GOAL' }))).toBe('골을 기록할까요?');
    expect(title(input({ type: 'FOUL' }))).toBe('파울을 기록할까요?');
    expect(title(input({ type: 'CARD', payload: { card: 'YELLOW' } }))).toBe('옐로카드를 기록할까요?');
    expect(title(input({ type: 'CARD', payload: { card: 'RED' } }))).toBe('레드카드를 기록할까요?');
  });

  it('자책골은 "기록"이 아니라 자책골로 묻고, 넣은 선수의 팀과 득점 팀을 구분한다', () => {
    const twoSides: GameSide[] = [sides[0], { ...sides[0], id: 'side-away', sideKey: 'AWAY', displayNameSnapshot: '원정팀' }];
    const lineups = [{ participants: [{ id: 'p-away', displayNameSnapshot: '김원정' }] }] as unknown as GameLineup[];
    const copy = commitActionConfirmCopy(input({ type: 'OWN_GOAL', participantId: 'p-away' }), twoSides, lineups, null);

    expect(copy.title).toBe('자책골을 기록할까요?');
    expect(copy.confirmLabel).toBe('자책골 기록');
    expect(copy.message).toBe('원정팀 · 김원정 (홈팀 득점) · 전반 1:00에 기록해요.');
  });

  it('시계 경고 병합 문구에도 같은 조사를 쓴다', () => {
    const { message } = commitActionConfirmCopy(input({ type: 'GOAL' }), sides, [], 40);

    expect(message).toContain('전반 1:00에 골을 기록해요.');
    expect(message).not.toContain('(를)');
  });
});

describe('commandConfirmCopy — 경기 종류에 맞는 종료 문구', () => {
  const twoSides: GameSide[] = [
    sides[0],
    { ...sides[0], id: 'side-away', sideKey: 'AWAY', displayNameSnapshot: '원정팀' },
  ];
  const ctx = {
    sides: twoSides,
    scoreBySideId: new Map([
      ['side-home', 1],
      ['side-away', 1],
    ]),
    isFinalPeriod: true,
    penaltyShootoutPossible: false,
    substitutionTracked: true,
  };

  it('후반 종료: 승부차기가 없는 리그·조별 경기는 승부차기를 말하지 않는다', () => {
    const { message } = commandConfirmCopy('end-period', '후반 종료', { ...ctx, penaltyShootoutPossible: false });

    expect(message).not.toContain('승부차기');
    expect(message).toContain('경기 결과는 아직 확정되지 않아요(다음 단계에서 경기 종료)');
  });

  it('후반 종료: 승부차기가 열리는 토너먼트 동점 경기는 기존 문구를 그대로 쓴다', () => {
    const { message } = commandConfirmCopy('end-period', '후반 종료', { ...ctx, penaltyShootoutPossible: true });

    expect(message).toContain('다음 단계에서 승부차기 입력 또는 경기 종료');
  });

  it('경기 종료: 교체를 기록하지 않는 롤링 교체 경기는 교체 확인을 요구하지 않는다', () => {
    const { message } = commandConfirmCopy('end', '경기 종료', { ...ctx, substitutionTracked: false });

    expect(message).not.toContain('교체');
    expect(message).toContain('기록한 골·카드를 먼저 확인해주세요.');
  });

  it('경기 종료: 교체를 기록하는 경기는 기존 문구를 그대로 쓴다', () => {
    const { message } = commandConfirmCopy('end', '경기 종료', { ...ctx, substitutionTracked: true });

    expect(message).toContain('기록한 골·카드·교체를 먼저 확인해주세요.');
  });
});

describe('commitActionConfirmCopy — 기록 시각 말머리', () => {
  const message = (periodCount: number | null | undefined) =>
    commitActionConfirmCopy(input({ type: 'GOAL' }), sides, [], null, periodCount).message;

  it('단판이면 "전반"을 붙이지 않고, 2피리어드·미상이면 지금처럼 붙인다', () => {
    expect(message(1)).toContain('(선수 지정 없이) · 1:00에');
    expect(message(1)).not.toContain('전반');
    expect(message(2)).toContain('전반 1:00에');
    expect(message(undefined)).toContain('전반 1:00에');
  });
});
