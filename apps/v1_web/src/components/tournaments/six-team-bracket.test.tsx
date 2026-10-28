import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SixTeamBracket } from './six-team-bracket';
import type { V1SixTeamBracket, V1TournamentFixture } from '@/types/api';
const state: V1SixTeamBracket = {
  rounds: ['a', 'b', 'c', 's', 'f'],
  bye: 'a-h',
  manual: false,
  winners: {},
  needsReview: false,
};
const fixtures: V1TournamentFixture[] = state.rounds.map((id, index) => ({
  id,
  fixtureNumber: index + 1,
  groupId: null,
  round: index < 3 ? '6강' : index === 3 ? '준결승' : '결승',
  legNumber: 1,
  scheduledAt: null,
  venue: null,
  status: index < 3 ? 'completed' : 'scheduled',
  liveStatus: index < 3 ? 'ended' : 'scheduled',
  homeRegistrationId: index < 3 ? id + '-h' : index === 4 ? 'a-h' : 'b-h',
  awayRegistrationId: index < 3 ? id + '-a' : index === 3 ? 'c-h' : null,
  homeTeamId: null,
  awayTeamId: null,
  homeTeamName: index < 3 ? id + '팀' : index === 4 ? 'a팀' : 'b팀',
  awayTeamName: index < 3 ? id + '상대팀' : index === 3 ? 'c팀' : 'TBD',
  homeTeamLogoUrl: null,
  awayTeamLogoUrl: null,
  homeSlotLabel: null,
  awaySlotLabel: null,
  result:
    index < 3
      ? {
          homeScore: 5 - index,
          awayScore: 1,
          hasPenalty: false,
          note: null,
          recordedAt: '2026-10-28T00:00:00Z',
          goals: [],
          homePenaltyScore: null,
          awayPenaltyScore: null,
        }
      : null,
  videos: [],
}));
describe('6강 공개 대진표 A안', () => {
  it('결선 필터의 내부 키로 선택한 경기만 표시하고 조 이름을 제목에 쓴다', () => {
    const { rerender } = render(<SixTeamBracket tournamentId="t1" state={state} fixtures={fixtures} selectedRoundKey="semi" stageLabels={{ semi: '준결승 조' }} />);
    expect(screen.getByRole('region', { name: '준결승 조' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: '6강' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: '결승' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: '경기 상세' })).toHaveLength(1);
    rerender(<SixTeamBracket tournamentId="t1" state={state} fixtures={fixtures} selectedRoundKey="quarter" />);
    expect(screen.getByRole('region', { name: '6강' })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: '경기 상세' })).toHaveLength(3);
    rerender(<SixTeamBracket tournamentId="t1" state={state} fixtures={fixtures} selectedRoundKey="final" />);
    expect(screen.getByRole('region', { name: '결승' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: '준결승' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: '경기 상세' })).toHaveLength(1);
  });
  it('6강 3경기·직행 선정·준결승·결승을 구분하고 가상 부전승 경기를 만들지 않는다', () => {
    render(
      <SixTeamBracket tournamentId="t1" state={state} fixtures={fixtures} />
    );
    expect(
      screen
        .getByRole('region', { name: '6강' })
        .querySelectorAll('[role="group"]')
    ).toHaveLength(3);
    expect(
      screen.getByRole('heading', { name: '결승 직행 · a팀' })
    ).toBeInTheDocument();
    expect(screen.getAllByRole('group', { name: / 대 / })).toHaveLength(5);
    expect(
      within(screen.getByRole('region', { name: '결승' })).getByText(
        '준결승 승리팀'
      )
    ).toBeInTheDocument();
    expect(screen.getByRole('table')).toHaveTextContent('5');
    expect(screen.getAllByRole('link', { name: '경기 상세' })).toHaveLength(5);
    expect(
      screen.getAllByRole('link', { name: '경기 상세' })[0]
    ).toHaveAttribute('href', '/tournaments/t1/matches/a');
  });
  it('직행팀 변경과 운영자 지정·재검토 상태를 그대로 표시한다', () => {
    render(
      <SixTeamBracket
        tournamentId="t1"
        state={{ ...state, bye: 'b-h', manual: true, needsReview: true }}
        fixtures={fixtures}
      />
    );
    expect(
      screen.getByRole('heading', { name: '결승 직행 · b팀' })
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        '결과가 정정되어 운영자가 진출팀을 다시 확인하고 있어요.'
      )
    ).toBeInTheDocument();
  });
  it('숨겨진 팀명과 점수 대신 임의 이름·0점을 만들지 않는다', () => {
    render(
      <SixTeamBracket
        tournamentId="t1"
        state={state}
        fixtures={fixtures.map((row) => ({
          ...row,
          homeTeamName: null,
          awayTeamName: null,
          result: null,
        }))}
      />
    );
    expect(
      screen.getByRole('heading', { name: '결승 직행 · 비공개' })
    ).toBeInTheDocument();
    expect(screen.getByRole('table')).not.toHaveTextContent('a팀');
    expect(screen.getByRole('table')).not.toHaveTextContent('5');
  });
});
