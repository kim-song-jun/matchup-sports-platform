import { describe, expect, it } from 'vitest';
import {
  REVIEW_TAG_OPTIONS,
  formatReviewProgress,
  getReviewProgress,
  incompleteHint,
  incompleteNote,
  reviewDraftStatus,
  sourceTypeLabel,
  toReviewsPageModel,
  toReviewsReceivedPageModel,
  toTargetViewModel,
} from './reviews.view-model';
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
  it('운영 리뷰는 별도 그룹에 표시하고 참가자 평균에서 제외한다', () => {
    const common = {
      sourceId: 'match-1', targetType: 'user' as const, targetUser: { userId: 'me', name: '나', imageUrl: null },
      targetTeam: null, reviewerTeam: null, status: 'submitted' as const, submittedAt: null,
      anonymous: false, tags: [], source: null,
    };
    const model = toReviewsReceivedPageModel({
      items: [
        { ...common, reviewId: 'peer', sourceType: 'team_match', rating: 5, reviewerUser: { userId: 'player', name: '참가자', imageUrl: null } },
        { ...common, reviewId: 'ops', sourceType: 'platform_team_match', rating: 1, reviewerUser: { userId: null, name: 'Teameet 운영', imageUrl: null } },
      ],
      pageInfo: { nextCursor: null, hasNext: false },
    });
    expect(model.stats.find((stat) => stat.label === '참가자 평균')?.value).toBe('5');
    expect(model.userGroups).toHaveLength(2);
    expect(model.userGroups.find((group) => group.sourceType === 'platform_team_match')?.meta).toContain('운영 평가');
  });
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

  it('익명 대회 리뷰와 이전 리뷰를 서로 다른 섹션으로 분리한다', () => {
    const shared = {
      sourceType: 'tournament_fixture' as const,
      sourceId: 'fixture-1',
      targetType: 'user' as const,
      targetUser: { userId: 'me', name: '나', imageUrl: null },
      targetTeam: null,
      rating: 5,
      tags: [{ tagCode: 'manner', label: '매너가 좋아요' }],
      status: 'submitted' as const,
      submittedAt: '2026-08-14T12:00:00.000Z' as string | null,
      source: null as { sourceType: 'tournament_fixture'; sourceId: string; title: string; completedAt: string | null } | null,
    };
    const model = toReviewsReceivedPageModel({
      items: [
        {
          ...shared,
          reviewId: 'r1',
          anonymous: false,
          reviewerUser: { userId: 'reviewer-1', name: '보낸 사람', imageUrl: null },
          reviewerTeam: null,
          source: { sourceType: 'tournament_fixture', sourceId: shared.sourceId, title: '여름컵 · 8강 2경기', completedAt: '2026-08-14T12:00:00.000Z' },
        },
      ],
      pageInfo: { nextCursor: null, hasNext: false },
    });

    // "이전 리뷰"(제도 전) 분기는 제거했다 — 받은 리뷰는 한 목록으로 모은다.
    expect(model.userGroups.flatMap((group) => group.reviews).map((review) => review.reviewId)).toEqual(['r1']);
    // 카드 제목이 "대회 경기"처럼 종류만 나오면 어느 경기였는지 알 수 없다.
    expect(model.userGroups[0]?.title).toBe('여름컵 · 8강 2경기');
    expect(model.userGroups[0]?.meta).toContain('받은 리뷰 1건');
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

describe('reviews view model — 작성 현황과 제출 대상', () => {
  const target = (id: string, overrides: Partial<V1ReviewTarget> = {}): V1ReviewTarget => ({
    targetType: 'user',
    targetUserId: id,
    targetTeamId: null,
    reviewerTeam: null,
    name: `선수${id}`,
    imageUrl: null,
    subtitle: '참가자',
    alreadySubmitted: false,
    review: null,
    locked: false,
    lockReason: null,
    ...overrides,
  });
  const team = target('opp', { targetType: 'team', targetUserId: null, targetTeamId: 'opp', name: '상대팀' });

  it('별과 태그가 모두 있어야 ready 이고, 하나만 있는 draft 는 어느 쪽이 빠졌는지 남는다', () => {
    expect(reviewDraftStatus({ rating: null, tagCodes: [] })).toBe('empty');
    expect(reviewDraftStatus({ rating: 4, tagCodes: [] })).toBe('needsTags');
    expect(reviewDraftStatus({ rating: null, tagCodes: ['manner'] })).toBe('needsRating');
    expect(reviewDraftStatus({ rating: 4, tagCodes: ['manner'] })).toBe('ready');
  });

  it('부분 입력은 제출 목록에서 조용히 빠지지 않고 incomplete 로 분리된다', () => {
    const progress = getReviewProgress([team, target('1'), target('2'), target('3')], {
      'team:opp': { rating: 5, tagCodes: ['manner'] },
      'user:1': { rating: 3, tagCodes: [] },
      'user:2': { rating: null, tagCodes: ['teamwork'] },
    });

    expect(progress.ready.map((item) => item.target.name)).toEqual(['상대팀']);
    expect(progress.incomplete.map((item) => [item.target.name, item.missing])).toEqual([
      ['선수1', 'tags'],
      ['선수2', 'rating'],
    ]);
    // 손대지 않은 선수3 만 "남은 대상" 이다.
    expect(progress).toMatchObject({ submitted: 0, inProgress: 3, remaining: 1 });
  });

  it('이미 보낸 대상과 잠긴 대상은 작성 중·남은 대상에 섞이지 않는다', () => {
    const progress = getReviewProgress(
      [target('1', { alreadySubmitted: true, locked: true }), target('2', { locked: true, lockReason: 'X' }), target('3')],
      { 'user:2': { rating: 4, tagCodes: ['manner'] } },
    );

    expect(progress).toMatchObject({ submitted: 1, inProgress: 0, remaining: 1 });
    expect(progress.ready).toEqual([]);
  });

  it('세부 항목은 사람 대상에만 실리고, 직접 바꾸지 않은 항목은 그 draft 의 종합 별점을 따른다', () => {
    const progress = getReviewProgress([team, target('1')], {
      'team:opp': { rating: 4, tagCodes: ['manner'], metricOverrides: { skill: 1 } },
      'user:1': { rating: 3, tagCodes: ['manner'], metricOverrides: { manner: 5 } },
    });

    const [teamSubmission, playerSubmission] = progress.ready;
    expect(teamSubmission.metricScores).toBeUndefined();
    expect(playerSubmission.metricScores).toEqual({ skill: 3, manner: 5, punctuality: 3, safety: 3 });
  });

  it('현황 문구는 보낸 인원이 있을 때만 앞에 붙인다', () => {
    expect(formatReviewProgress({ submitted: 0, inProgress: 2, remaining: 5, ready: [], incomplete: [] })).toBe('작성 중 2명 · 남은 대상 5명');
    expect(formatReviewProgress({ submitted: 1, inProgress: 0, remaining: 3, ready: [], incomplete: [] })).toBe('작성 완료 1명 · 작성 중 0명 · 남은 대상 3명');
  });

  it('덜 끝난 대상이 하나면 그 이름과 빠진 것을, 여럿이면 첫 이름과 건수를 말한다', () => {
    const one = [{ target: target('1'), missing: 'rating' as const }];
    expect(incompleteHint(one)).toBe('선수1의 별점을 골라 주세요');
    expect(incompleteNote(one)).toBe('별점이 빠진 1건은 아직 보낼 수 없어요');

    const many = [...one, { target: target('2'), missing: 'tags' as const }];
    expect(incompleteHint(many)).toBe('선수1 외 1건의 별점·태그가 비어 있어요');
    expect(incompleteNote(many)).toBe('별점이나 태그가 빠진 2건은 아직 보낼 수 없어요');
    expect(incompleteHint([])).toBeNull();
    expect(incompleteNote([])).toBeNull();
  });
});

describe('reviews view model — 대상 아바타 이니셜 (F54)', () => {
  const target = (name: string): V1ReviewTarget => ({
    targetType: 'team',
    targetUserId: null,
    targetTeamId: 'team-1',
    reviewerTeam: null,
    name,
    imageUrl: null,
    subtitle: '대회 상대 팀',
    alreadySubmitted: false,
    review: null,
    locked: false,
    lockReason: null,
  });

  it('앞의 괄호·공백을 건너뛴 두 글자, 글자가 없으면 "리뷰"', () => {
    expect(toTargetViewModel(target('(QA0929) 마포 FC')).initials).toBe('QA');
    expect(toTargetViewModel(target(' 마포 FC')).initials).toBe('마포');
    expect(toTargetViewModel(target('()')).initials).toBe('리뷰');
  });
});
