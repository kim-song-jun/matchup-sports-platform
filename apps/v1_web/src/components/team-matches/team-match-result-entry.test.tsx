import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SharedRecord } from '@/hooks/use-team-match-record';
import { TeamMatchResultEntry } from './team-match-result-entry';

const recordMock = vi.hoisted(() => vi.fn());
const detail = vi.hoisted(() => ({ viewer: {} as Record<string, boolean>, resolveChat: vi.fn(), push: vi.fn() }));

vi.mock('@/hooks/use-team-match-record', () => ({ useTeamMatchRecord: recordMock }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: detail.push }) }));
vi.mock('@/hooks/use-v1-api', () => ({
  useV1TeamMatch: () => ({ data: { viewer: detail.viewer } }),
  useV1ResolveChatRoom: () => ({ mutate: detail.resolveChat, isPending: false, isError: false, error: null }),
}));
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
    operator: false,
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

// H5 D-3 — 우리는 냈는데 상대가 안 낸 친선: 기록은 막힌 채 다음 행동 세 개를 준다.
describe('TeamMatchResultEntry — 상대 팀 참석명단을 기다릴 때 (H5 D-3)', () => {
  const waiting = () => record({
    phase: 'live',
    sides: [
      { id: 'side-home', key: 'HOME', name: '마포 FC', score: null },
      { id: 'side-away', key: 'AWAY', name: '합정 유나이티드', score: null },
    ],
    missingSides: [{ sideId: 'side-away', sideKey: 'AWAY', teamName: '합정 유나이티드' }],
  });

  beforeEach(() => {
    recordMock.mockReset();
    detail.resolveChat.mockReset();
    detail.push.mockReset();
  });

  it('팀장·매니저는 상대 팀장 채팅·우리 참석명단·경기 상세로 갈 수 있고, 두 팀의 제출 상태를 본다', () => {
    detail.viewer = { manageableHostTeam: true };
    recordMock.mockReturnValue({ data: waiting() });
    render(<TeamMatchResultEntry teamMatchId="tm-1" />);

    expect(screen.getByRole('heading', { name: '상대 팀 참석명단을 기다리고 있어요' })).toBeInTheDocument();
    expect(screen.getByText('마포 FC · 제출 완료')).toBeInTheDocument();
    expect(screen.getByText('합정 유나이티드 · 미제출')).toBeInTheDocument();
    expect(screen.getByText('상대가 킥오프 뒤에 내도 바로 기록을 시작할 수 있어요.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '우리 참석명단 보기' })).toHaveAttribute('href', '/team-matches/tm-1/lineup');
    expect(screen.getByRole('link', { name: '경기 상세로' })).toHaveAttribute('href', '/team-matches/tm-1?view=detail');

    fireEvent.click(screen.getByRole('button', { name: '상대 팀장에게 채팅 보내기' }));
    expect(detail.resolveChat).toHaveBeenCalledWith({ targetType: 'team_match', targetId: 'tm-1' }, expect.anything());
    detail.resolveChat.mock.calls[0][1].onSuccess({ roomId: 'room-1', route: null });
    expect(detail.push).toHaveBeenCalledWith(expect.stringContaining('room-1'));
    expect(screen.queryByRole('link', { name: '참석명단 등록하기' })).not.toBeInTheDocument();
  });

  it('대조군 — 명단에 든 선수(팀장·매니저 아님)는 채팅·참석명단 입구 없이 경기 상세로만 간다', () => {
    detail.viewer = { participantMember: true };
    recordMock.mockReturnValue({ data: waiting() });
    render(<TeamMatchResultEntry teamMatchId="tm-1" />);

    expect(screen.getByRole('heading', { name: '상대 팀 참석명단을 기다리고 있어요' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '상대 팀장에게 채팅 보내기' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '우리 참석명단 보기' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: '경기 상세로' })).toBeInTheDocument();
  });
});
