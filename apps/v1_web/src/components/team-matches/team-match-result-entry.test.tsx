import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SharedRecord } from '@/hooks/use-team-match-record';
import { TeamMatchResultEntry } from './team-match-result-entry';

const recordMock = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/use-team-match-record', () => ({ useTeamMatchRecord: recordMock }));
vi.mock('./team-match-result-client', () => ({
  TeamMatchResultPageClient: () => <div>결과 화면</div>,
  TeamMatchResultApprovalPageClient: () => <div>승인 화면</div>,
}));
vi.mock('./team-match-shared-record', () => ({ TeamMatchSharedRecord: () => <div>공동 기록</div> }));

function record(overrides: Partial<SharedRecord>): SharedRecord {
  return {
    teamMatchId: 'tm-1',
    title: '경기',
    startsAt: null,
    phase: 'scheduled',
    version: 0,
    serverTime: '2026-09-29T00:00:00.000Z',
    canEdit: false,
    participant: true,
    ownSideId: 'side-home',
    lineupReady: false,
    missingSides: [{ sideId: 'side-home', sideKey: 'HOME', teamName: '우리 팀' }],
    sides: [],
    subMatches: [],
    participants: [],
    goals: [],
    history: [],
    confirmations: [],
    officialAt: null,
    ...overrides,
  };
}

describe('TeamMatchResultEntry — 명단이 빈 팀이 있을 때', () => {
  beforeEach(() => {
    recordMock.mockReset();
  });

  it('친선은 우리 팀 참석명단 등록 화면으로 보낸다', () => {
    recordMock.mockReturnValue({ data: record({ phase: 'scheduled' }) });

    render(<TeamMatchResultEntry teamMatchId="tm-1" />);

    expect(screen.getByRole('heading', { name: '참석명단 등록이 필요해요' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '참석명단 등록하기' })).toHaveAttribute('href', '/team-matches/tm-1/lineup');
  });

  it('대회·리그(managed)는 참석명단으로 보내지 않고 참가 명단을 안내한다', () => {
    recordMock.mockReturnValue({ data: record({ phase: 'managed' }) });

    render(<TeamMatchResultEntry teamMatchId="tm-1" />);

    expect(screen.getByRole('heading', { name: '경기 명단이 비어 있어요' })).toBeInTheDocument();
    expect(screen.getByText('우리 팀 · 명단 없음')).toBeInTheDocument();
    expect(screen.getByText('참가 명단에 선수를 등록하면 경기 명단에 들어가요.')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByText(/참석명단/)).not.toBeInTheDocument();
  });

  it('명단이 다 있으면 대회·리그도 결과 화면을 연다', () => {
    recordMock.mockReturnValue({ data: record({ phase: 'managed', lineupReady: true, missingSides: [] }) });

    render(<TeamMatchResultEntry teamMatchId="tm-1" />);

    expect(screen.getByText('결과 화면')).toBeInTheDocument();
  });
});
