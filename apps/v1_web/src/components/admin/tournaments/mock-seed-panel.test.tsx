import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MockSeedPanel, mockSeedBlockReason } from './mock-seed-panel';
const mocks = vi.hoisted(()=>({ mutate:vi.fn() }));
vi.mock('@/hooks/use-v1-api',()=>({
  useV1MockSeedAvailability:()=>({data:{enabled:true,usableTeamCount:32,maxTeamCount:32,minPlayersPerTeam:3,rankedLeagueUsableTeamCount:20,rankedLeagueMaxTeamCount:20}}),
  useV1CreateMockTournament:()=>({mutate:mocks.mutate,isPending:false}),
}));

describe('mockSeedBlockReason — 서버가 막는 목업 조합을 미리 알려준다', () => {
  it('순위별 리그는 기존 팀 수·상태 선택을 유지하되4의 배수와결과상한을 검증한다', () => {
    expect(mockSeedBlockReason({ format: 'ranked_leagues', teamCount: 20, status: 'completed' })).toBeNull();
    expect(mockSeedBlockReason({ format: 'ranked_leagues', teamCount: 12, status: 'in_progress' })).toBeNull();
    expect(mockSeedBlockReason({ format: 'ranked_leagues', teamCount: 10 })).toContain('4의 배수');
    expect(mockSeedBlockReason({ format: 'ranked_leagues', teamCount: 24, withResults: true })).toContain('20팀');
    expect(mockSeedBlockReason({ format: 'ranked_leagues', teamCount: 20, status: 'open', withResults: true })).toContain('모집중');
    expect(mockSeedBlockReason({ format: 'ranked_leagues', teamCount: 20, status: 'in_progress', reviewReady: true })).toContain('종료');
  });
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

describe('목업 카테고리 선택',()=>{
  beforeEach(()=>mocks.mutate.mockReset());
  it('팀 수·상태를 유지하며 새 카테고리와 실제 생성 payload를 연결한다',()=>{
    render(<MockSeedPanel/>);
    fireEvent.change(screen.getByLabelText('팀 수'),{target:{value:'20'}});
    fireEvent.change(screen.getByLabelText('상태'),{target:{value:'completed'}});
    fireEvent.change(screen.getByLabelText('형식'),{target:{value:'ranked_leagues'}});
    expect(screen.getByLabelText('팀 수')).toHaveValue(20);expect(screen.getByLabelText('상태')).toHaveValue('completed');
    expect(screen.getByLabelText('라인업까지 제출')).toBeChecked();expect(screen.getByLabelText('라인업까지 제출')).toBeDisabled();
    fireEvent.click(screen.getByRole('button',{name:'목업 대회 만들기'}));
    expect(mocks.mutate).toHaveBeenCalledWith(expect.objectContaining({format:'ranked_leagues',teamCount:20,status:'completed',withLineups:true}),expect.any(Object));
    fireEvent.change(screen.getByLabelText('형식'),{target:{value:'knockout'}});expect(screen.getByLabelText('팀 수')).toHaveValue(20);expect(screen.getByLabelText('라인업까지 제출')).not.toBeDisabled();
  });
  it('지원하지 않는 팀 수는 이유를 보여주고 생성 요청을 보내지 않는다',()=>{
    render(<MockSeedPanel/>);fireEvent.change(screen.getByLabelText('형식'),{target:{value:'ranked_leagues'}});fireEvent.change(screen.getByLabelText('팀 수'),{target:{value:'10'}});
    expect(screen.getByRole('button',{name:'목업 대회 만들기'})).toBeDisabled();expect(screen.getByText(/4의 배수/)).toBeInTheDocument();expect(mocks.mutate).not.toHaveBeenCalled();
  });
});
