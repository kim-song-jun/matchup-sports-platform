import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TournamentFlowSection } from './tournament-flow-section';
import type { V1TournamentFormat } from '@/types/api';

describe('TournamentFlowSection', () => {
  it.each([
    ['league', ['풀리그', '순위 집계', '시상']],
    ['group_knockout', ['조별 리그', '결선 진출', '결선 토너먼트']],
    ['knockout', ['대진 편성', '토너먼트', '결승 · 시상']],
    ['league_knockouts', ['조별 리그', '토너먼트 배정', '결선 토너먼트']],
  ] as const)('%s는 선택한 방식의 단계만 보여준다', (format, titles) => {
    render(<TournamentFlowSection tournament={{ format, kind: 'regular_tournament' }} />);
    const region = screen.getByRole('region', { name: '대회 진행 방식' });
    expect(within(region).getAllByRole('listitem').map((item) => item.querySelector('.tm-text-label')?.textContent)).toEqual(titles);
  });

  it('같은 화면에서 진행 방식을 바꾸면 이전 방식의 안내를 남기지 않는다', () => {
    const { rerender } = render(<TournamentFlowSection tournament={{ format: 'group_knockout', kind: 'regular_tournament' }} />);
    for (const format of ['league', 'knockout', 'group_knockout'] as V1TournamentFormat[]) {
      rerender(<TournamentFlowSection tournament={{ format, kind: 'regular_tournament' }} />);
      expect(screen.queryByText('결선 진출', { exact: true }) !== null).toBe(format === 'group_knockout');
      expect(screen.queryByText('순위 집계', { exact: true }) !== null).toBe(format === 'league');
    }
  });

  it('정규리그 + N개 토너먼트는 풀리그 안내와 조별 리그 후 토너먼트 라벨을 쓰지 않는다', () => {
    render(<TournamentFlowSection tournament={{ format: 'league_knockouts', kind: 'regular_tournament' }} />);
    expect(screen.getByText('정규리그 + N개 토너먼트')).toBeInTheDocument();
    expect(screen.queryByText('풀리그', { exact: true })).not.toBeInTheDocument();
    expect(screen.queryByText('조별 리그 후 토너먼트')).not.toBeInTheDocument();
  });

  it('정규 리그의 기본 format이 group_knockout이어도 리그 안내를 유지한다', () => {
    render(<TournamentFlowSection tournament={{ format: 'group_knockout', kind: 'regular_league' }} />);
    expect(screen.getByText('풀리그', { exact: true })).toBeInTheDocument();
    expect(screen.queryByText('결선 진출', { exact: true })).not.toBeInTheDocument();
    // 정규 리그는 대회 설정이 아니라 리그 공통 순서로 가린다(MD-QA #186 Copilot 지적).
    expect(screen.getByText(/리그 공통 규정\(골득실 → 다득점 → 승자승 → 최소 실점\)/)).toBeInTheDocument();
  });

  it('6강 · 결승 직행 방식은 3·4위전이 있다고 안내하지 않는다', () => {
    render(<TournamentFlowSection tournament={{ format: 'knockout', kind: 'regular_tournament', sixTeamMode: true }} />);
    expect(screen.queryByText(/3·4위전도 함께 진행돼요/)).not.toBeInTheDocument();
    expect(screen.getByText(/3·4위전 없이 결승/)).toBeInTheDocument();
  });

  it('일반 토너먼트는 3·4위전 안내를 유지한다', () => {
    render(<TournamentFlowSection tournament={{ format: 'knockout', kind: 'regular_tournament', sixTeamMode: false }} />);
    expect(screen.getByText(/3·4위전도 함께 진행돼요/)).toBeInTheDocument();
  });
});
