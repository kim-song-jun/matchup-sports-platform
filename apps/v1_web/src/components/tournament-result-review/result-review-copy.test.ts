import { describe, expect, it } from 'vitest';
import { describeResultReviewError } from './result-review-copy';

/**
 * 정정 레인의 승부차기 가드(서버측 PR)가 추가되면서 아래 3개 도메인 에러 코드가
 * 이 화면에서 **새로 도달 가능**해졌다. `KNOWN_ERROR_MESSAGES` 에 없는 코드는
 * `extractErrorMessage` 폴백을 타고 **서버 원문이 그대로** 화면에 뜨는데, 그중
 * 4개 메시지가 영문이다(서버 문구는 바이트 동일 제약이 있어 서버에서 못 바꾼다).
 *
 * 서버 원문(`apps/v1_api/src/games/games.service.ts`, base 0d48cd8f 실측):
 *   TOURNAMENT_PENALTY_REQUIRED     :5216  '결선 경기는 무승부로 끝낼 수 없어요. 승부차기 결과를 입력해주세요.'  (409)
 *   TOURNAMENT_PENALTY_NOT_ALLOWED  :5224  'Penalty shootouts can only be recorded for knockout-phase fixtures'  (409)
 *   TOURNAMENT_PENALTY_NOT_ALLOWED  :5230  'Penalty shootouts are only recorded when regulation time ends level'  (409)
 *   TOURNAMENT_PENALTY_INVALID      :509   'penalties must be an object with non-negative integer home and away scores'  (422)
 *   TOURNAMENT_PENALTY_INVALID      :517   'A penalty shootout must produce a decisive winner'  (422)
 *
 * 한 코드에 서버 메시지가 2종인 경우 프론트는 두 변종을 **구분할 수 없다** --
 * `extractErrorCode` 는 code 만 읽고, 두 변종의 code·HTTP status 가 완전히 같다
 * (NOT_ALLOWED 둘 다 409, INVALID 둘 다 422). 서버 원문 substring 매칭은 "바꿀 수
 * 없는 영문 원문"에 프론트를 결합시키는 새 기술부채이므로, **코드별 문구 하나로
 * 합치고 그 문구가 두 원인을 모두 포괄**하는 것이 유일하게 정직한 선택이다.
 * 아래 테스트가 그 계약(같은 코드 → 서버 메시지와 무관하게 같은 안내)을 고정한다.
 */

const SERVER_MESSAGES = {
  TOURNAMENT_PENALTY_REQUIRED: ['결선 경기는 무승부로 끝낼 수 없어요. 승부차기 결과를 입력해주세요.'],
  TOURNAMENT_PENALTY_NOT_ALLOWED: [
    'Penalty shootouts can only be recorded for knockout-phase fixtures',
    'Penalty shootouts are only recorded when regulation time ends level',
  ],
  TOURNAMENT_PENALTY_INVALID: [
    'penalties must be an object with non-negative integer home and away scores',
    'A penalty shootout must produce a decisive winner',
  ],
} as const;

/** V1ApiError 는 최상위 `code`/`message` 에 도메인 코드와 서버 문구를 담는다. */
function apiError(code: string, message: string) {
  return { code, message };
}

describe('describeResultReviewError — 승부차기 가드 에러 3종 (한국어 해요체 매핑)', () => {
  for (const [code, serverMessages] of Object.entries(SERVER_MESSAGES)) {
    it(`${code} 는 한국어 해요체 안내로 노출된다 (영문 원문 노출 금지)`, () => {
      for (const serverMessage of serverMessages) {
        const shown = describeResultReviewError(apiError(code, serverMessage));

        // 영어 단어가 그대로 노출되면 안 된다(3자 이상 연속 라틴 문자).
        expect(shown).not.toMatch(/[A-Za-z]{3,}/);
        // 서버 원문이 그대로 새 나가면 안 된다. 이 단언이 없으면 서버 문구가 이미
        // 한국어인 `TOURNAMENT_PENALTY_REQUIRED` 케이스는 프론트 매핑을 지워도 통과해
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

/**
 * 아래 두 테스트는 지금도 통과한다 -- 위 실패가 하네스(에러 객체 형태·추출 경로)
 * 탓이 아니라 **매핑 누락** 탓임을 가르는 대조군이다. 두 번째 테스트는 미매핑
 * 코드에서 서버 원문이 그대로 노출되는 현재 동작(= 위 3개 코드가 영문으로 새는
 * 정확한 메커니즘)을 그대로 고정한다.
 */
describe('describeResultReviewError — 하네스 정상 동작 증명 (대조군)', () => {
  it('이미 매핑된 코드는 서버 원문과 무관하게 매핑 문구를 돌려준다', () => {
    expect(describeResultReviewError(apiError('SCORER_REQUIRED', 'raw server text'))).toBe(
      '득점자를 입력해야 확정할 수 있어요.',
    );
  });

  it('매핑되지 않은 코드는 서버 원문을 그대로 노출한다', () => {
    expect(describeResultReviewError(apiError('SOME_UNMAPPED_CODE', 'A penalty shootout must produce a decisive winner'))).toBe(
      'A penalty shootout must produce a decisive winner',
    );
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
