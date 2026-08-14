import { describe, expect, it } from 'vitest';
import { REVIEW_TAG_OPTIONS, sourceTypeLabel, toReviewsPageModel, toTargetViewModel } from './reviews.view-model';
import type { V1ReviewTarget } from '@/types/api';

/**
 * v1 API(reviews.service.ts의 REVIEW_TAGS)가 수용하는 리뷰 태그 코드의 정본.
 * 서버는 `uniqueTagCodes`에서 `tagCode in REVIEW_TAGS`로 필터링하므로, 이 집합에 없는
 * 코드를 UI가 보내면 **조용히 누락**된다(400도 아니고 그냥 사라짐). 따라서 UI 옵션 코드는
 * 반드시 이 집합의 부분집합이어야 한다. (UI가 8개를 모두 제공할 의무는 없음 — 현재 UI는
 * 6개만 큐레이션해 노출하며, active/passionate는 의도적으로 제외된 것으로 본다.)
 * v1_api에서 REVIEW_TAGS를 변경하면 이 목록도 함께 갱신해야 한다.
 */
const API_ACCEPTED_CODES = new Set([
  'punctual',
  'manner',
  'teamwork',
  'communication',
  'active',
  'considerate',
  'passionate',
  'play_again',
]);

describe('reviews view model — 태그 옵션 계약', () => {
  it('모든 옵션 코드가 API 수용 집합에 속한다 (제출 시 조용히 누락되지 않음)', () => {
    const offending = REVIEW_TAG_OPTIONS.map((option) => option.code).filter(
      (code) => !API_ACCEPTED_CODES.has(code),
    );
    // 실패 시 어떤 코드가 API에 없는지 메시지에 드러나도록 빈 배열과 비교한다.
    expect(offending).toEqual([]);
  });

  it('코드 중복이 없다 (같은 태그가 두 번 노출되지 않음)', () => {
    const codes = REVIEW_TAG_OPTIONS.map((option) => option.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('모든 옵션이 비어있지 않은 한국어 라벨을 가진다', () => {
    for (const option of REVIEW_TAG_OPTIONS) {
      expect(option.label.trim().length).toBeGreaterThan(0);
    }
  });
});

describe('reviews view model — 대회 경기 리뷰 계약', () => {
  it('대회 경기 source를 사용자에게 별도 경기 유형으로 표시한다', () => {
    expect(sourceTypeLabel('tournament_fixture')).toBe('대회 경기');
  });

  it('대회 fixture 상대팀 리뷰는 리뷰 목록에서 상대팀 CTA로 보인다', () => {
    const model = toReviewsPageModel({
      items: [
        {
          sourceType: 'tournament_fixture',
          sourceId: '00000000-0000-4000-8000-000000000101',
          title: 'TeamMeet Cup · 결승 7경기',
          completedAt: '2026-06-20T12:00:00.000Z',
          targetType: 'team',
          targetCount: 1,
          reviewedCount: 0,
          remainingCount: 1,
          state: 'ready',
          reviewerTeam: { teamId: 'team-1', name: '성수 FC' },
          targetTeam: { teamId: 'team-2', name: '마포 러너스' },
        },
      ],
      pageInfo: { nextCursor: null, hasNext: false },
    }, 'pending');

    expect(model.cards[0]).toMatchObject({
      href: '/my/reviews/tournament_fixture/00000000-0000-4000-8000-000000000101',
      badgeLabel: '상대팀',
      kindLabel: '대회 경기',
      ctaLabel: '리뷰',
    });
  });
});

/**
 * lockReason 은 API 의 에러 코드값이다. 이걸 그대로 렌더하면 사용자 화면에
 * 'ALREADY_SUBMITTED' 라는 영문 코드가 그대로 뜬다 — alpha 에서 실제로 그렇게 노출됐다.
 */
describe('reviews view model — 잠김 사유 문구', () => {
  const target = (overrides: Partial<V1ReviewTarget> = {}): V1ReviewTarget => ({
    targetType: 'team',
    targetUserId: null,
    targetTeamId: 'team-1',
    reviewerTeam: null,
    name: '상대 팀',
    imageUrl: null,
    subtitle: '대회 상대 팀',
    alreadySubmitted: false,
    review: null,
    locked: false,
    lockReason: null,
    ...overrides,
  });

  it('ALREADY_SUBMITTED 코드를 화면에 그대로 노출하지 않는다', () => {
    const model = toTargetViewModel(target({ locked: true, alreadySubmitted: true, lockReason: 'ALREADY_SUBMITTED' }));

    expect(model.lockReasonLabel).toBeNull();
    // 작성 완료 사실 자체는 배지로 계속 전달된다 — 정보가 사라지는 게 아니라 중복이 사라진다.
    expect(model.statusLabel).toBe('작성됨');
  });

  it('아직 매핑하지 않은 코드는 삼키지 않고 그대로 보여준다', () => {
    const model = toTargetViewModel(target({ locked: true, lockReason: 'SOME_FUTURE_REASON' }));

    expect(model.lockReasonLabel).toBe('SOME_FUTURE_REASON');
  });

  it('잠기지 않은 대상은 사유 문구가 없다', () => {
    expect(toTargetViewModel(target()).lockReasonLabel).toBeNull();
  });
});
