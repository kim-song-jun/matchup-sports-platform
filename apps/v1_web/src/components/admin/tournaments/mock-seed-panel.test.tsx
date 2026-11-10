import { describe, expect, it } from 'vitest';
import { mockSeedBlockReason } from './mock-seed-panel';

describe('mockSeedBlockReason — 서버가 막는 목업 조합을 미리 알려준다', () => {
  it('정규리그+N개 토너먼트는 종료 상태로 만들 수 없다', () => {
    expect(mockSeedBlockReason({ format: 'league_knockouts', teamCount: 32, status: 'completed' })).toContain('모집중·진행중');
    expect(mockSeedBlockReason({ format: 'league_knockouts', teamCount: 32, status: 'in_progress', withResults: true })).toBeNull();
  });

  it('모집중 상태에는 경기 결과·후기 작성 가능을 함께 고를 수 없다', () => {
    expect(mockSeedBlockReason({ format: 'league', teamCount: 4, status: 'open', withResults: true })).toContain('모집중');
    expect(mockSeedBlockReason({ format: 'league', teamCount: 4, status: 'open', reviewReady: true })).toContain('모집중');
    expect(mockSeedBlockReason({ format: 'league', teamCount: 4, status: 'open' })).toBeNull();
    expect(mockSeedBlockReason({ format: 'league', teamCount: 4, status: 'in_progress', withResults: true })).toBeNull();
  });

  it('리그·조별리그+토너먼트는 결과까지 채우면 16팀까지', () => {
    expect(mockSeedBlockReason({ format: 'league', teamCount: 16, withResults: true })).toBeNull();
    expect(mockSeedBlockReason({ format: 'league', teamCount: 17, withResults: true })).toContain('16팀');
    expect(mockSeedBlockReason({ format: 'group_knockout', teamCount: 32, status: 'completed' })).toContain('16팀');
    expect(mockSeedBlockReason({ format: 'league', teamCount: 20, reviewReady: true })).toContain('16팀');
    expect(mockSeedBlockReason({ format: 'league', teamCount: 32, status: 'in_progress' })).toBeNull();
    expect(mockSeedBlockReason({ format: 'knockout', teamCount: 32, status: 'completed' })).toBeNull();
  });
});
