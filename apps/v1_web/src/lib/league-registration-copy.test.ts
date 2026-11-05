import { describe, expect, it } from 'vitest';

import { describeLeagueRegistrationWindow } from './league-registration-copy';

describe('리그 신청 창 안내 문구 (2026-10-27 상태 기준)', () => {
  it('접수 중이면 언제까지 받는지 말한다', () => {
    expect(
      describeLeagueRegistrationWindow({ status: 'open', registrationOpen: true, registrationDeadlineAt: '2026-09-10T11:00:00.000Z' }),
    ).toBe('9/10 (목) 20:00까지 신청을 받아요.');
  });

  it('마감 없이 접수 중이면 접수 마감하기로 닫는다고 말한다', () => {
    expect(
      describeLeagueRegistrationWindow({ status: 'open', registrationOpen: true, registrationDeadlineAt: null }),
    ).toBe("마감 없이 신청을 받아요. '접수 마감하기'를 누르면 닫혀요.");
  });

  it('접수 중인데 마감이 지났으면 마감 시각을 되짚어 준다', () => {
    expect(
      describeLeagueRegistrationWindow({ status: 'open', registrationOpen: false, registrationDeadlineAt: '2026-08-10T11:00:00.000Z' }),
    ).toBe('신청이 마감됐어요. 마감은 8/10 (월) 20:00 였어요.');
  });

  it.each([
    ['draft', "아직 접수를 시작하지 않았어요. 리그 위의 '접수 시작하기'를 누르면 신청을 받아요."],
    ['closed', "접수를 마감했어요. 리그를 시작하기 전에는 '접수 시작하기'로 다시 열 수 있어요."],
    ['in_progress', '시작한 리그라 신청을 받지 않아요. 팀은 참가팀 관리에서 직접 넣어 주세요.'],
    ['on_hold', '보류 중이라 신청을 받지 않아요.'],
    ['completed', '끝났거나 취소된 리그라 신청을 받지 않아요.'],
  ])('%s 리그는 마감이 미래여도 상태가 닫힌 이유를 말한다', (status, copy) => {
    const text = describeLeagueRegistrationWindow({ status, registrationOpen: false, registrationDeadlineAt: '2099-01-01T00:00:00.000Z' });
    expect(text).toBe(copy);
    expect(text).not.toContain('마감됐어요');
  });
});
