import { describe, expect, it } from 'vitest';
import { V1ApiError } from '@/lib/api-client';
import { describeBracketCanvasError } from './bracket-canvas-errors';

function apiError(code: string, message = '서버 원문이에요.') {
  return new V1ApiError({
    statusCode: 409,
    code,
    message,
    details: null,
    requestId: 'req-1',
    timestamp: '2026-10-08T00:00:00.000Z',
  } as unknown as ConstructorParameters<typeof V1ApiError>[0]);
}

describe('describeBracketCanvasError', () => {
  it.each([
    ['NEXT_FIXTURE_CONFLICT', '다음 경기가 이미 시작돼서 바꿀 수 없어요.'],
    ['QUICK_RESULT_ROSTER_SYNCING', '명단을 맞추는 중이에요. 잠시 뒤 다시 눌러 주세요.'],
    ['SLOT_LOCKED', '이미 시작했거나 결과가 있는 경기라 팀을 바꿀 수 없어요.'],
    ['SLOT_TEAM_ALREADY_PLACED', '이미 다른 자리에 들어간 팀이에요.'],
    ['BRACKET_LOCKED', '시작했거나 결과가 있는 경기가 있어 대진을 교체할 수 없어요.'],
    ['BRACKET_TEMPLATE_TOO_LARGE', '경기가 너무 많아 한 번에 만들 수 없어요. 팀 수나 회전 수를 줄여 주세요.'],
    ['GROUP_HAS_SLOTS', '자리가 남아 있는 조는 지울 수 없어요. 자리를 먼저 비워 주세요.'],
    ['IDEMPOTENCY_PAYLOAD_CONFLICT', '같은 요청이 다른 내용으로 이미 처리됐어요. 새로고침한 뒤 다시 시도해 주세요.'],
    ['LEAGUE_ON_HOLD', '보류 중인 리그라 대진을 바꿀 수 없어요.'],
    ['LEAGUE_ENDED', '끝났거나 취소된 리그라 대진을 바꿀 수 없어요.'],
  ])('%s 는 정해 둔 해요체 문구로 바꾼다', (code, expected) => {
    expect(describeBracketCanvasError(apiError(code), '실패했어요.')).toBe(expected);
  });

  it('결과 화면이 이미 가진 코드는 그 문구를 재사용한다', () => {
    expect(describeBracketCanvasError(apiError('PROJECTION_PREVIEW_MISMATCH'), '실패했어요.')).toBe(
      '결과 내용이 방금 바뀌었어요. 최신 내용을 다시 확인한 뒤 시도해 주세요.',
    );
  });

  it('모르는 코드는 서버가 준 문장을 그대로 보여 준다', () => {
    expect(describeBracketCanvasError(apiError('SOMETHING_NEW', '새 서버 문장이에요.'), '실패했어요.')).toBe('새 서버 문장이에요.');
  });

  it('에러 객체가 아니면 fallback 을 쓴다', () => {
    expect(describeBracketCanvasError(undefined, '실패했어요.')).toBe('실패했어요.');
  });
});
