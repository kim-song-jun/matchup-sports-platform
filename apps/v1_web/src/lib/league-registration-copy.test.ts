import { describe, expect, it } from 'vitest';

import { describeLeagueRegistrationWindow } from './league-registration-copy';

const HINT = '마감을 정해야 신청을 받아요.';

describe('리그 신청 창 안내 문구', () => {
  it('열려 있으면 언제까지 받는지 말한다', () => {
    expect(
      describeLeagueRegistrationWindow({
        state: 'active',
        registrationOpen: true,
        registrationDeadlineAt: '2026-09-10T11:00:00.000Z',
        noDeadlineHint: HINT,
      }),
    ).toBe('9/10 (목) 20:00까지 신청을 받아요.');
  });

  it('마감이 지나 닫혔으면 마감 시각을 되짚어 준다 — 마감을 바꾸면 다시 열리기 때문', () => {
    expect(
      describeLeagueRegistrationWindow({
        state: 'active',
        registrationOpen: false,
        registrationDeadlineAt: '2026-08-10T11:00:00.000Z',
        noDeadlineHint: HINT,
      }),
    ).toBe('신청이 마감됐어요. 마감은 8/10 (월) 20:00 였어요.');
  });

  it('끝난 리그는 **마감이 미래여도** "마감됐어요" 라고 하지 않는다', () => {
    // 이 자리가 이 헬퍼가 존재하는 이유다. 끝난 리그의 마감은 보통 미래로 남아 있고,
    // 그때 "마감됐어요" 라고 하면 운영자는 마감을 다시 넣어 보고 409 를 맞는다.
    const copy = describeLeagueRegistrationWindow({
      state: 'completed',
      registrationOpen: false,
      registrationDeadlineAt: '2099-01-01T00:00:00.000Z',
      noDeadlineHint: HINT,
    });
    expect(copy).toBe('끝났거나 취소된 리그라 신청을 받지 않아요.');
    expect(copy).not.toContain('마감됐어요');
  });

  it('끝난 리그는 마감이 실제로 지났어도 끝난 사실을 먼저 말한다 — 되돌릴 수 없는 쪽이 우선', () => {
    expect(
      describeLeagueRegistrationWindow({
        state: 'completed',
        registrationOpen: false,
        registrationDeadlineAt: '2020-01-01T00:00:00.000Z',
        noDeadlineHint: HINT,
      }),
    ).toBe('끝났거나 취소된 리그라 신청을 받지 않아요.');
  });

  it('마감이 없으면 화면이 준 다음 행동을 그대로 안내한다 (정본 §6: 안 정하면 안 받는다)', () => {
    expect(
      describeLeagueRegistrationWindow({
        state: 'draft',
        registrationOpen: false,
        registrationDeadlineAt: null,
        noDeadlineHint: HINT,
      }),
    ).toBe(HINT);
  });

  it('포맷할 수 없는 값이 와도 문장을 만든다 — 원본을 그대로 보여 준다', () => {
    expect(
      describeLeagueRegistrationWindow({
        state: 'active',
        registrationOpen: true,
        registrationDeadlineAt: 'not-a-date',
        noDeadlineHint: HINT,
      }),
    ).toBe('not-a-date까지 신청을 받아요.');
  });
});
