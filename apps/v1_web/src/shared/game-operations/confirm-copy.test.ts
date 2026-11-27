import { describe, expect, it } from 'vitest';
import type { GameLineup, GameSide } from '@/types/game-operations';
import type { EventCaptureCommitInput } from './action-target-picker';
import {
  clockCheckConfirmCopy,
  commandConfirmCopy,
  penaltyShootoutFinishConfirmCopy,
  penaltyShootoutOverrideFinishConfirmCopy,
  penaltyShootoutStartConfirmCopy,
  playerLabel,
  recordNounOf,
  recordedToastCopy,
  sentOffPlayerNoticeCopy,
} from './confirm-copy';

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

describe('clockCheckConfirmCopy — 수상한 시계일 때만 묻는 확인', () => {
  it('무엇이 언제 기록되는지와 이 경기 시간의 보통 길이를 말한다', () => {
    const copy = clockCheckConfirmCopy(input({ type: 'GOAL' }), sides, [], 40);

    expect(copy.title).toBe('기록 시각을 확인해주세요');
    expect(copy.confirmLabel).toBe('그대로 기록');
    expect(copy.tone).toBe('danger');
    expect(copy.message).toContain('전반 1:00에 골을 기록해요.');
    expect(copy.message).toContain('이 경기 시간은 보통 40분이에요');
    expect(copy.message).not.toContain('피리어드');
  });

  it('받침 없는 기록 이름에는 "를"을 붙인다', () => {
    const { message } = clockCheckConfirmCopy(input({ type: 'CARD', payload: { card: 'RED' } }), sides, [], 20);
    expect(message).toContain('레드카드를 기록해요.');
  });

  it('자책골은 넣은 선수의 팀과 득점 팀을 구분한다', () => {
    const twoSides: GameSide[] = [sides[0], { ...sides[0], id: 'side-away', sideKey: 'AWAY', displayNameSnapshot: '원정팀' }];
    const lineups = [{ participants: [{ id: 'p-away', displayNameSnapshot: '김원정' }] }] as unknown as GameLineup[];
    const { message } = clockCheckConfirmCopy(input({ type: 'OWN_GOAL', participantId: 'p-away' }), twoSides, lineups, 20);

    expect(message).toContain('원정팀 · 김원정 (홈팀 득점) · 전반 1:00에 자책골을 기록해요.');
  });
});

describe('recordedToastCopy — 기록 직후 토스트', () => {
  const twoSides: GameSide[] = [sides[0], { ...sides[0], id: 'side-away', sideKey: 'AWAY', displayNameSnapshot: '원정팀' }];
  const lineups = [
    { participants: [{ id: 'p-home', displayNameSnapshot: '김홈' }, { id: 'p-sub', displayNameSnapshot: '박교체' }] },
    { participants: [{ id: 'p-away', displayNameSnapshot: '김원정' }] },
  ] as unknown as GameLineup[];

  it('무엇을 · 어느 팀 · 누구에게 기록했는지 말한다', () => {
    expect(recordedToastCopy(input({ type: 'GOAL', participantId: 'p-home' }), twoSides, lineups).message).toBe(
      '골 · 홈팀 · 김홈 기록했어요',
    );
    expect(recordedToastCopy(input({ type: 'CARD', participantId: 'p-home', payload: { card: 'YELLOW' } }), twoSides, lineups).message).toBe(
      '옐로카드 · 홈팀 · 김홈 기록했어요',
    );
    expect(recordedToastCopy(input({ type: 'FOUL', participantId: 'p-home' }), twoSides, lineups).message).toBe(
      '파울 · 홈팀 · 김홈 기록했어요',
    );
  });

  it('팀만이면 선수 모름이라고 적는다', () => {
    expect(recordedToastCopy(input({ type: 'GOAL', payload: { anonymous: true } }), twoSides, lineups).message).toBe(
      '골 · 홈팀 (선수 모름) 기록했어요',
    );
    expect(recordedToastCopy(input({ type: 'FOUL' }), twoSides, lineups).message).toBe('파울 · 홈팀 (선수 모름) 기록했어요');
  });

  it('자책골은 넣은 팀과 득점하는 팀을 함께 적는다', () => {
    expect(recordedToastCopy(input({ type: 'OWN_GOAL', participantId: 'p-away' }), twoSides, lineups).message).toBe(
      '자책골 · 원정팀 · 김원정 (홈팀 득점) 기록했어요',
    );
    expect(recordedToastCopy(input({ type: 'OWN_GOAL', payload: { anonymous: true } }), twoSides, lineups).message).toBe(
      '자책골 · 원정팀 (선수 모름, 홈팀 득점) 기록했어요',
    );
  });

  it('교체는 나가는 선수와 들어오는 선수를 적는다', () => {
    expect(
      recordedToastCopy(input({ type: 'SUBSTITUTION', participantId: 'p-sub', payload: { outParticipantId: 'p-home' } }), twoSides, lineups).message,
    ).toBe('교체 · 홈팀 · 김홈 → 박교체 기록했어요');
  });

  it('끊긴 동안에는 기록했다고 하지 않고 이 기기에 뒀다고 말한다', () => {
    expect(recordedToastCopy(input({ type: 'GOAL', participantId: 'p-home' }), twoSides, lineups).offlineMessage).toBe(
      '골 · 홈팀 · 김홈 이 기기에 기록해 뒀어요',
    );
  });

  it('noun 을 주면 그 이름으로 적는다(경고 누적 퇴장)', () => {
    expect(
      recordedToastCopy(input({ type: 'CARD', participantId: 'p-home', payload: { card: 'RED' } }), twoSides, lineups, '경고 누적 퇴장').message,
    ).toBe('경고 누적 퇴장 · 홈팀 · 김홈 기록했어요');
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

describe('clockCheckConfirmCopy — 기록 시각 말머리', () => {
  const message = (periodCount: number | null | undefined) =>
    clockCheckConfirmCopy(input({ type: 'GOAL' }), sides, [], 40, periodCount).message;

  it('단판이면 "전반"을 붙이지 않고, 전·후반 경기·미상이면 붙인다', () => {
    expect(message(1)).toContain('(선수 모름) · 1:00에');
    expect(message(1)).not.toContain('전반');
    expect(message(2)).toContain('전반 1:00에');
    expect(message(undefined)).toContain('전반 1:00에');
  });
});

describe('점수·팀 이름 뒤 조사는 받침을 따른다', () => {
  const home: GameSide = { ...sides[0], displayNameSnapshot: '마포 레인저스' };
  const away: GameSide = { ...sides[0], id: 'side-away', sideKey: 'AWAY', displayNameSnapshot: '송파 유나이티드' };
  const scores = (homeScore: number, awayScore: number) =>
    new Map([
      ['side-home', homeScore],
      ['side-away', awayScore],
    ]);
  const ctx = (awayScore: number) => ({
    sides: [home, away],
    scoreBySideId: scores(2, awayScore),
    isFinalPeriod: true,
    penaltyShootoutPossible: false,
    substitutionTracked: true,
  });

  // 0=영, 3=삼 은 받침이 있어 "으로", 2=이·4=사·5=오·9=구 는 "로", 1=일·7=칠·8=팔 은 ㄹ 받침이라 "로".
  it.each([
    [0, '송파 유나이티드 0으로'],
    [2, '송파 유나이티드 2로'],
    [3, '송파 유나이티드 3으로'],
    [8, '송파 유나이티드 8로'],
  ])('경기 종료·후반 종료·전반 종료 확인 창: 원정 %i점 → "%s"', (awayScore, expected) => {
    for (const [command, isFinalPeriod] of [
      ['end', true],
      ['end-period', true],
      ['end-period', false],
    ] as const) {
      const { message } = commandConfirmCopy(command, '종료', { ...ctx(awayScore), isFinalPeriod });
      expect(message).toContain(`${expected} `);
    }
  });

  it('승부차기 시작 확인 창도 점수 받침을 따른다', () => {
    const copy = (awayScore: number) => penaltyShootoutStartConfirmCopy([home, away], scores(awayScore, awayScore)).message;
    expect(copy(0)).toContain('송파 유나이티드 0으로 끝났어요');
    expect(copy(2)).toContain('송파 유나이티드 2로 끝났어요');
  });

  it.each([
    ['송파 유나이티드', '송파 유나이티드예요'],
    ['마포 레인저스', '마포 레인저스예요'],
    ['서울 강남', '서울 강남이에요'],
    ['FC 서울(U18)', 'FC 서울(U18)이에요'],
  ])('승부차기 종료 확인 창: 선축 %s → %s', (name, expected) => {
    const firstKick: GameSide = { ...away, displayNameSnapshot: name };
    expect(penaltyShootoutFinishConfirmCopy(home, firstKick, 3, 3, firstKick).message).toContain(`선축은 ${expected}.`);
    expect(penaltyShootoutOverrideFinishConfirmCopy(home, firstKick, 3, 3, 4, 3, firstKick).message).toContain(
      `선축은 ${expected}.`,
    );
  });
});

describe('playerLabel — 확인 문구·도움 창 제목의 운영진 실명', () => {
  it.each([
    ['운영진(실명 있음)', { realName: '김실명', phone: null }, '김실명 (정우진)'],
    ['권한 없음(identity 키 없음)', undefined, '정우진'],
  ])('%s', (_, identity, name) => {
    const row = identity === undefined ? { id: 'p-1', displayNameSnapshot: '정우진' } : { id: 'p-1', displayNameSnapshot: '정우진', identity };
    const lineups = [{ participants: [row] }] as unknown as GameLineup[];

    expect(playerLabel('p-1', lineups)).toBe(name);
    expect(recordedToastCopy(input({ type: 'GOAL', participantId: 'p-1' }), sides, lineups).message)
      .toBe(`골 · 홈팀 · ${name} 기록했어요`);
  });
});

describe('sentOffPlayerNoticeCopy — 퇴장한 선수 재확인 문구', () => {
  it('제목은 퇴장 사실을 먼저 말하고, 본문은 레드카드를 받은 시각과 기록 이름을 보여 준다', () => {
    const copy = sentOffPlayerNoticeCopy({ playerName: '수용5팀장', sentOffWhen: '후반 8:12', noun: '골' });

    expect(copy.title).toBe('수용5팀장은 퇴장한 선수예요');
    expect(copy.message).toBe('후반 8:12에 레드카드를 받고 퇴장했어요. 그래도 골을 기록할까요?');
    expect(copy.backLabel).toBe('다른 선수 고르기');
    expect(copy.continueLabel).toBe('그래도 계속');
  });

  it('받침 없는 이름은 "는", 받침 없는 기록 이름은 "를"을 붙인다', () => {
    const copy = sentOffPlayerNoticeCopy({ playerName: '정우', sentOffWhen: '전반 3:00', noun: '옐로카드' });

    expect(copy.title).toBe('정우는 퇴장한 선수예요');
    expect(copy.message).toContain('그래도 옐로카드를 기록할까요?');
  });

  it('퇴장 시각을 모르면 시각 없이 묻고, 어시스트는 "추가"로 묻는다', () => {
    const copy = sentOffPlayerNoticeCopy({ playerName: '조현우', sentOffWhen: null, noun: '어시스트', verb: '추가' });

    expect(copy.message).toBe('레드카드를 받고 퇴장했어요. 그래도 어시스트를 추가할까요?');
  });
});

describe('recordNounOf — 기록 이름', () => {
  it('골·자책골·파울·카드 색에 맞는 이름을 돌려준다', () => {
    expect(recordNounOf(input({ type: 'GOAL' }))).toBe('골');
    expect(recordNounOf(input({ type: 'OWN_GOAL' }))).toBe('자책골');
    expect(recordNounOf(input({ type: 'FOUL' }))).toBe('파울');
    expect(recordNounOf(input({ type: 'CARD', payload: { card: 'YELLOW' } }))).toBe('옐로카드');
    expect(recordNounOf(input({ type: 'CARD', payload: { card: 'RED' } }))).toBe('레드카드');
  });
});
