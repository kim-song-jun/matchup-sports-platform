import { describe, expect, it } from 'vitest';
import { describeResultReviewError } from './result-review-copy';

/**
 * 승부차기 가드 에러가 이 화면에 도달할 때의 문구 계약.
 *
 * - `TOURNAMENT_PENALTY_REQUIRED`·`_NOT_ALLOWED`·`_INVALID`: 서버가 원인별 한국어 문구를
 *   직접 보낸다. 매핑이 같은 코드의 두 원인을 한 문장으로 뭉개던 손실이 있었으므로
 *   서버 문구를 그대로 보여 준다.
 * - `_KICK_COUNTS_REQUIRED`·`_UNDECIDED`: 서버 문구는 API 호출자가 고칠 필드 이름을 담고
 *   있어, 화면은 code 로 결정되는 안내를 따로 보여 준다.
 */

const MAPPED_SERVER_MESSAGES = {
  TOURNAMENT_PENALTY_KICK_COUNTS_REQUIRED: [
    '승부차기를 기록하려면 양 팀이 찬 킥 수(penalties.takenHome, penalties.takenAway)를 함께 보내 주세요.',
  ],
  TOURNAMENT_PENALTY_UNDECIDED: [
    '이 대회 규칙으로는 승부차기 승자가 아직 정해지지 않았어요. 킥 수와 점수를 확인하거나, 운영자가 결과를 직접 정한다면 penalties.operatorOverride를 true로 보내 주세요.',
  ],
} as const;

/** 서버가 원인별로 보내는 한국어 문구 — 화면은 이 문구를 그대로 보여 준다. */
const PASS_THROUGH_SERVER_MESSAGES = {
  TOURNAMENT_PENALTY_REQUIRED: ['결선 경기는 무승부로 끝낼 수 없어요. 승부차기 결과를 입력해주세요.'],
  TOURNAMENT_PENALTY_NOT_ALLOWED: [
    '승부차기는 결선 경기에서만 기록할 수 있어요.',
    '승부차기는 정규시간이 무승부로 끝난 경기에서만 기록할 수 있어요.',
  ],
  TOURNAMENT_PENALTY_INVALID: [
    '승부차기 점수(penalties)는 home과 away가 모두 0 이상의 정수여야 해요.',
    '승부차기는 승자가 갈려야 해요. 두 팀 점수를 서로 다르게 입력해 주세요.',
  ],
} as const;

/** V1ApiError 는 최상위 `code`/`message` 에 도메인 코드와 서버 문구를 담는다. */
function apiError(code: string, message: string) {
  return { code, message };
}

describe('describeResultReviewError — 화면용 안내가 필요한 승부차기 에러 2종 (한국어 해요체 매핑)', () => {
  for (const [code, serverMessages] of Object.entries(MAPPED_SERVER_MESSAGES)) {
    it(`${code} 는 한국어 해요체 안내로 노출된다 (영문 원문 노출 금지)`, () => {
      for (const serverMessage of serverMessages) {
        const shown = describeResultReviewError(apiError(code, serverMessage));

        // 서버 문구의 필드 이름(영문)이 화면에 새면 안 된다(3자 이상 연속 라틴 문자).
        expect(shown).not.toMatch(/[A-Za-z]{3,}/);
        // 서버 원문이 그대로 새 나가면 안 된다. 이 단언이 없으면 매핑을 지워도 통과해
        // 공허해진다(폴백이 서버 원문을 그대로 돌려주기 때문).
        expect(shown).not.toBe(serverMessage);
        // 해요체 (`~해요`/`~주세요`) -- 합니다체 금지.
        expect(shown).toMatch(/(해요|주세요)/);
        expect(shown).toMatch(/승부차기/);
      }
    });

    it(`${code} 의 안내는 서버 메시지가 아니라 code 로 결정된다`, () => {
      // 같은 코드의 서버 메시지 변종(그리고 알 수 없는 임의 문구, 메시지가 아예
      // 없는 경우)이 모두 같은 안내로 수렴해야 한다 -- 프론트가 서버 원문
      // 문자열에 결합되면 안 되고, 본문이 유실돼도 일반 폴백('요청을 처리하지
      // 못했어요…')이 아니라 이 상황에 맞는 안내가 떠야 한다.
      const shown = serverMessages.map((message) => describeResultReviewError(apiError(code, message)));
      const withPlaceholder = describeResultReviewError(apiError(code, 'raw server text'));
      const withoutMessage = describeResultReviewError({ code });

      expect(new Set([...shown, withPlaceholder, withoutMessage]).size).toBe(1);
    });
  }
});

describe('describeResultReviewError — 서버가 한국어로 보내는 승부차기 에러는 그대로 보여 준다', () => {
  for (const [code, serverMessages] of Object.entries(PASS_THROUGH_SERVER_MESSAGES)) {
    it(`${code} 는 서버 문구를 그대로 노출한다`, () => {
      for (const serverMessage of serverMessages) {
        expect(describeResultReviewError(apiError(code, serverMessage))).toBe(serverMessage);
      }
    });
  }

  it('같은 코드의 서로 다른 원인이 서로 다른 안내로 남는다 — 한 문장으로 뭉개지 않는다', () => {
    const shown = PASS_THROUGH_SERVER_MESSAGES.TOURNAMENT_PENALTY_NOT_ALLOWED.map((message) =>
      describeResultReviewError(apiError('TOURNAMENT_PENALTY_NOT_ALLOWED', message)),
    );
    expect(new Set(shown).size).toBe(2);
  });
});

/**
 * 하네스(에러 객체 형태·추출 경로)가 정상임을 가르는 대조군. 두 번째 테스트는 미매핑
 * 코드에서 서버 원문이 그대로 노출되는 동작 — 위 pass-through 테스트가 기대는 경로 — 을 고정한다.
 */
describe('describeResultReviewError — 하네스 정상 동작 증명 (대조군)', () => {
  it('이미 매핑된 코드는 서버 원문과 무관하게 매핑 문구를 돌려준다', () => {
    expect(describeResultReviewError(apiError('SCORER_REQUIRED', 'raw server text'))).toBe(
      '득점자를 입력해야 확정할 수 있어요.',
    );
  });

  it('매핑되지 않은 코드는 서버 원문을 그대로 노출한다', () => {
    expect(describeResultReviewError(apiError('SOME_UNMAPPED_CODE', '서버가 보낸 문구'))).toBe('서버가 보낸 문구');
  });
});

describe('describeResultReviewError — 재제출 거부 문구 (Task 166 contract)', () => {
  it('없어진 상태 어휘로 안내하지 않는다 — 확인 대기 기준으로 말한다', () => {
    // contract 가 `REJECTED`·`SUPPLEMENT_REQUESTED` 를 없앴다. 그 어휘로 안내하면 운영자가
    // **있지도 않은 상태**를 화면에서 찾게 된다. base 는 이제 `SUBMITTED`(확인 대기) 뿐이다.
    const message = describeResultReviewError({
      response: { data: { code: 'RESULT_RESUBMISSION_NOT_ALLOWED' } },
    });
    expect(message).toContain('확인 대기');
    expect(message).not.toContain('반려');
    expect(message).not.toContain('보완');
  });
});

describe('describeResultReviewError — RESULT_ALREADY_OFFICIAL (contract 신설 409)', () => {
  it('영문 서버 원문 대신 한국어 안내로 노출되고, 다음 행동을 말한다', () => {
    // 매핑이 없으면 `extractErrorMessage` 폴백이 서버 원문("This game already has an
    // official result; use a correction instead")을 그대로 화면에 띄운다.
    const message = describeResultReviewError({
      response: {
        data: {
          code: 'RESULT_ALREADY_OFFICIAL',
          message: 'This game already has an official result; use a correction instead',
        },
      },
    });
    expect(message).not.toContain('official result');
    expect(message).toContain('공식 결과');
    // 무엇을 하라는 안내가 있어야 한다 — 막혔다는 사실만으로는 운영자가 다음 수를 모른다.
    expect(message).toContain('정정');
  });
});

describe('describeResultReviewError — RESULT_GOAL_TIMELINE_INVALID', () => {
  it('서버가 같은 코드로 보내는 영문 문구 5종이 모두 같은 한국어 안내로 바뀐다', () => {
    const serverMessages = [
      'Goal timeline totals must match the submitted score',
      'Participant goal totals must match the official goal timeline',
      'Goal participant must belong to the credited side',
      'Own-goal participant must belong to the opposing side',
      'Goal timeline ids must be unique and use a game side',
    ];
    const shown = new Set(
      serverMessages.map((message) => describeResultReviewError(apiError('RESULT_GOAL_TIMELINE_INVALID', message))),
    );

    expect(shown.size).toBe(1);
    const [message] = [...shown];
    expect(message).not.toMatch(/[A-Za-z]{3,}/);
    expect(message).toMatch(/득점 기록/);
  });
});
