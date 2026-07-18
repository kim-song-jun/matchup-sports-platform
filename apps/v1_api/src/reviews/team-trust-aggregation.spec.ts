import { computeRevealedTeamTrustBatch } from './team-trust-aggregation';

const teamA = '00000000-0000-4000-8000-0000000000a1';
const teamB = '00000000-0000-4000-8000-0000000000a2';
const teamC = '00000000-0000-4000-8000-0000000000a3';

function makeCandidate(overrides: Partial<{
  targetTeamId: string;
  sourceId: string;
  reviewerTeamId: string;
  rating: number;
  submittedAt: Date;
}>) {
  return {
    targetTeamId: teamA,
    sourceId: 'source-1',
    reviewerTeamId: teamB,
    rating: 5,
    submittedAt: new Date('2026-07-19T00:00:00Z'),
    ...overrides,
  };
}

describe('computeRevealedTeamTrustBatch', () => {
  it('teamIds가 비어있으면 쿼리 없이 빈 Map을 반환한다', async () => {
    const findMany = jest.fn();
    const prisma = { v1PostEventReview: { findMany } };

    const result = await computeRevealedTeamTrustBatch(prisma as never, []);

    expect(result.size).toBe(0);
    expect(findMany).not.toHaveBeenCalled();
  });

  it('여러 팀이 섞인 candidates에서 각 팀이 정확히 자기 자신의 리뷰만 집계한다 (targetTeamId 혼동 방지)', async () => {
    const now = new Date('2026-07-19T00:10:00Z'); // 상호제출 즉시공개 경로, 72시간 미경과
    const candidates = [
      makeCandidate({ targetTeamId: teamA, sourceId: 'src-a', reviewerTeamId: teamB, rating: 5 }),
      makeCandidate({ targetTeamId: teamC, sourceId: 'src-c', reviewerTeamId: teamB, rating: 1 }),
    ];
    // 상호 리뷰: teamA가 teamB에게(src-a), teamC가 teamB에게는 안 보냄(src-c 미공개 유지)
    const reverse = [{ sourceId: 'src-a', reviewerTeamId: teamA, targetTeamId: teamB }];

    const findMany = jest.fn()
      .mockResolvedValueOnce(candidates)
      .mockResolvedValueOnce(reverse);
    const prisma = { v1PostEventReview: { findMany } };

    jest.useFakeTimers().setSystemTime(now);
    const result = await computeRevealedTeamTrustBatch(prisma as never, [teamA, teamC]);
    jest.useRealTimers();

    // teamA: src-a 리뷰 공개(상호제출), rating 5만 반영 — teamC의 rating 1이 섞이면 안 된다.
    expect(result.get(teamA)).toEqual({ trustState: 'estimated', mannerScore: 5, reviewCount: 1 });
    // teamC: candidate(src-c)는 있지만 상호제출 없음 + 72시간 미경과 → 비공개 → 0건("계산됨" = 'none',
    // candidate 자체가 없는 팀의 기본값 'sample'과는 구분된다)
    expect(result.get(teamC)).toEqual({ trustState: 'none', mannerScore: null, reviewCount: 0 });
  });

  it('상호제출(reverse 있음)과 72시간 경과(reverse 없음) 둘 다 공개로 집계한다', async () => {
    const submittedAt = new Date('2026-07-10T00:00:00Z');
    const now = new Date('2026-07-19T00:00:00Z'); // 9일 경과 > 72시간
    const candidates = [
      makeCandidate({ targetTeamId: teamA, sourceId: 'src-mutual', reviewerTeamId: teamB, rating: 4, submittedAt }),
      makeCandidate({ targetTeamId: teamA, sourceId: 'src-elapsed', reviewerTeamId: teamC, rating: 2, submittedAt }),
    ];
    const reverse = [{ sourceId: 'src-mutual', reviewerTeamId: teamA, targetTeamId: teamB }];

    const findMany = jest.fn()
      .mockResolvedValueOnce(candidates)
      .mockResolvedValueOnce(reverse);
    const prisma = { v1PostEventReview: { findMany } };

    jest.useFakeTimers().setSystemTime(now);
    const result = await computeRevealedTeamTrustBatch(prisma as never, [teamA]);
    jest.useRealTimers();

    expect(result.get(teamA)).toEqual({ trustState: 'estimated', mannerScore: 3, reviewCount: 2 });
  });

  it('리뷰가 아예 없는 팀은 sample/null/0으로 Map에 포함된다', async () => {
    const findMany = jest.fn()
      .mockResolvedValueOnce([]); // candidates 없음 -> reverse 쿼리 스킵
    const prisma = { v1PostEventReview: { findMany } };

    const result = await computeRevealedTeamTrustBatch(prisma as never, [teamA, teamB]);

    expect(result.get(teamA)).toEqual({ trustState: 'sample', mannerScore: null, reviewCount: 0 });
    expect(result.get(teamB)).toEqual({ trustState: 'sample', mannerScore: null, reviewCount: 0 });
    expect(findMany).toHaveBeenCalledTimes(1);
  });

  it('findMany 호출 횟수는 팀 개수와 무관하게 정확히 2회다 (N+1 방지)', async () => {
    const candidates = [makeCandidate({ targetTeamId: teamA, sourceId: 'src-1', reviewerTeamId: teamB })];
    const findManyFor3 = jest.fn()
      .mockResolvedValueOnce(candidates)
      .mockResolvedValueOnce([]);
    const prisma3 = { v1PostEventReview: { findMany: findManyFor3 } };
    await computeRevealedTeamTrustBatch(prisma3 as never, [teamA, teamB, teamC]);
    expect(findManyFor3).toHaveBeenCalledTimes(2);

    const teamD = '00000000-0000-4000-8000-0000000000a4';
    const teamE = '00000000-0000-4000-8000-0000000000a5';
    const findManyFor5 = jest.fn()
      .mockResolvedValueOnce(candidates)
      .mockResolvedValueOnce([]);
    const prisma5 = { v1PostEventReview: { findMany: findManyFor5 } };
    await computeRevealedTeamTrustBatch(prisma5 as never, [teamA, teamB, teamC, teamD, teamE]);
    expect(findManyFor5).toHaveBeenCalledTimes(2);
  });
});
