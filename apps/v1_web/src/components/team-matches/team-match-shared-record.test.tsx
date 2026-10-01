import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TeamMatchSharedRecord, TeamMatchRecordEntry } from './team-match-shared-record';
import type { SharedRecord } from '@/hooks/use-team-match-record';
import { V1_NETWORK_ERROR_CODE, V1ApiError } from '@/lib/api-client';

const state = vi.hoisted(() => ({ data: {} as SharedRecord, mutate: vi.fn(), refetch: vi.fn(), replace: vi.fn(), search: '', mutationError: undefined as unknown }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: state.replace }),
  useSearchParams: () => new URLSearchParams(state.search),
}));
vi.mock('@/hooks/use-team-match-record', () => ({
  useTeamMatchRecord: () => ({ data: state.data, isError: false, refetch: state.refetch }),
  useMutateTeamMatchRecord: () => ({ mutateAsync: state.mutate, isPending: false, isError: state.mutationError !== undefined, error: state.mutationError, reset: vi.fn() }),
}));
// 신원 연결 입구는 리그 경기 상세와 같은 컴포넌트다(자체 테스트 있음) — 여기서는 노출 조건만 본다.
const claim = vi.hoisted(() => ({ viewer: undefined as Record<string, unknown> | undefined }));
// 늦게 온 선수 추가(H5 A-4)는 참석명단 응답의 lateAdditionAllowed 로 열린다 — 팀장·매니저일 때만 조회한다.
const lineup = vi.hoisted(() => ({ data: undefined as Record<string, unknown> | undefined, calls: [] as Array<{ enabled?: boolean }>, add: vi.fn() }));
vi.mock('@/hooks/use-v1-api', () => ({
  useV1TeamMatch: () => ({ data: claim.viewer === undefined ? undefined : { viewer: claim.viewer } }),
  useV1TeamMatchLineup: (_id: string, options?: { enabled?: boolean }) => {
    lineup.calls.push(options ?? {});
    // 꺼 둔 쿼리도 캐시가 있으면 data 를 준다 — 화면이 역할을 다시 확인하는지 보려고 캐시처럼 늘 돌려준다.
    return { data: lineup.data };
  },
  useV1AddLateTeamMatchLineupParticipant: () => ({ mutate: lineup.add, isPending: false, isError: false, error: null }),
}));
vi.mock('@/components/public-game-records/claim-my-record', () => ({
  TeamMatchClaimMyRecordSection: ({ teamMatchId }: { teamMatchId: string }) => <button type="button">명단에서 나 찾기 ({teamMatchId})</button>,
}));
beforeEach(() => {
  state.mutationError = undefined;
  claim.viewer = undefined;
  lineup.data = undefined;
  lineup.calls = [];
  lineup.add.mockReset();
  state.mutate.mockReset().mockResolvedValue({});
  state.replace.mockReset();
  state.search = '';
  state.data = {
    teamMatchId: 'match', title: '한강 vs 마포', startsAt: '2026-09-21T00:00:00Z', phase: 'live', version: 3,
    serverTime: '2026-09-21T01:00:00Z', canEdit: true, participant: true, operator: false, ownSideId: 'home',
    lineupReady: true, missingSides: [],
    sides: [{ id: 'home', key: 'HOME', name: '한강', score: 0 }, { id: 'away', key: 'AWAY', name: '마포', score: 0 }],
    participants: [
      { id: 'h1', sideId: 'home', name: '김민수', jerseyNumber: 7, profileImageUrl: '/mock/players/minsu.jpg' },
      { id: 'a1', sideId: 'away', name: '박지훈', jerseyNumber: 10, profileImageUrl: null },
    ],
    subMatches: [], goals: [], confirmations: [], history: [], officialAt: null, officialCorrected: false,
  };
});
describe('shared record participant flow', () => {
  it('응답 없이 끊긴 저장은 서버 처리 여부를 모르니 재시도를 주고, 서버가 거절한 저장은 그 이유만 보여 준다(대조군)', () => {
    state.mutationError = new V1ApiError(
      { status: 'error', timestamp: '', statusCode: 0, code: V1_NETWORK_ERROR_CODE, message: 'Failed to fetch' },
      { displayableMessage: false },
    );
    const offline = render(<TeamMatchSharedRecord teamMatchId="match" />);
    expect(screen.getByRole('alert')).toHaveTextContent('저장하지 못했어요.저장 여부를 확인하지 못했어요.');
    expect(screen.getByRole('button', { name: '저장 재시도' })).toBeInTheDocument();
    offline.unmount();

    state.mutationError = new V1ApiError({ status: 'error', timestamp: '', statusCode: 409, code: 'VERSION_CONFLICT', message: '다른 참가자가 먼저 고쳤어요.' });
    render(<TeamMatchSharedRecord teamMatchId="match" />);
    expect(screen.getByRole('alert')).toHaveTextContent('다른 참가자가 먼저 고쳤어요.');
    expect(screen.queryByRole('button', { name: '저장 재시도' })).not.toBeInTheDocument();
  });

  it('platform operators can record both sides, see history, but cannot confirm for a team', async () => {
    state.data = { ...state.data, participant: false, operator: true, ownSideId: null };
    render(<TeamMatchSharedRecord teamMatchId="match" admin />);
    expect(screen.getByRole('link', { name: '팀매치 운영 상세로' })).toHaveAttribute('href', '/admin/team-matches/match');
    expect(screen.queryByRole('button', { name: /종료 확인/ })).not.toBeInTheDocument();
    expect(screen.getByText(/변경 이력/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '득점 추가' }));
    expect(screen.getByText(/Teameet 운영으로/)).toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox', { name: '득점 팀' }), { target: { value: 'away' } });
    fireEvent.click(screen.getByRole('button', { name: '득점 등록' }));
    await waitFor(() => expect(state.mutate).toHaveBeenCalledWith(expect.objectContaining({ action: 'add', sideId: 'away', expectedVersion: 3 })));
  });

  it('admin legacy records never redirect into the public shell', () => {
    state.data = { ...state.data, phase: 'legacy', canEdit: false, participant: false, operator: true };
    render(<TeamMatchSharedRecord teamMatchId="match" admin />);
    expect(state.replace).not.toHaveBeenCalled();
    expect(screen.getByText(/공동 기록 대상이 아니에요/)).toBeInTheDocument();
  });
  it.each(['live', 'official'] as const)('%s: 자책골 선수는 실제 소속과 상대팀 득점 반영을 구분한다', (phase) => {
    state.data.phase = phase;
    state.data.canEdit = phase === 'live';
    state.data.goals = [
      { id: 'og', sideId: 'away', participantId: 'h1', ownGoal: true, minute: 12, subMatchId: null },
      { id: 'goal', sideId: 'away', participantId: 'a1', ownGoal: false, minute: 20, subMatchId: null },
    ];
    render(<TeamMatchSharedRecord teamMatchId="match" />);
    const ownGoalRow = within(screen.getByRole('group', { name: '김민수 득점 기록' }));
    expect(ownGoalRow.getByText('한강')).toBeInTheDocument();
    expect(ownGoalRow.getByText('자책골')).toBeInTheDocument();
    expect(ownGoalRow.getByText('마포 득점으로 반영')).toBeInTheDocument();
    expect(ownGoalRow.queryByText('마포', { exact: true })).not.toBeInTheDocument();
    const normalGoalRow = within(screen.getByRole('group', { name: '박지훈 득점 기록' }));
    expect(normalGoalRow.getByText('마포')).toBeInTheDocument();
    expect(normalGoalRow.queryByText(/득점으로 반영/)).not.toBeInTheDocument();
  });

  it('자책골 선수가 미지정이면 득점을 얻은 팀을 선수 소속으로 표시하지 않는다', () => {
    state.data.goals = [{ id: 'og', sideId: 'away', participantId: null, ownGoal: true, minute: null, subMatchId: null }];
    render(<TeamMatchSharedRecord teamMatchId="match" />);
    const row = within(screen.getByRole('group', { name: '득점자 미상 득점 기록' }));
    expect(row.getByText('소속팀 미상')).toBeInTheDocument();
    expect(row.getByText('마포 득점으로 반영')).toBeInTheDocument();
  });

  // 2026-09-29: "← 매치 상세" 카드 링크는 제거했다 — 뒤로가기는 매치 상세를 거치지 않고
  // 이 화면이 받은 출처로 곧장 돌아간다(활동기록 등). 출처가 아예 없을 때만(공유 링크로
  // 바로 들어온 경우) route-chrome 의 정적 backHref가 `?view=detail`로 매치 상세를 대신 가리킨다.
  it('경기 기록 화면에는 매치 상세로 가는 버튼이 없다', () => {
    render(<TeamMatchSharedRecord teamMatchId="match" />);
    expect(screen.queryByRole('link', { name: '← 매치 상세' })).not.toBeInTheDocument();
  });

  it('공동 경기 기록 열기 링크가 받은 출처를 그대로 뒤로가기 경로로 싣는다', () => {
    render(<TeamMatchRecordEntry teamMatchId="match" detailOnly fromHref="/my/team-matches" />);
    expect(screen.getByRole('link', { name: '공동 경기 기록 열기' })).toHaveAttribute(
      'href',
      `/team-matches/match/record?from=${encodeURIComponent('/my/team-matches')}`,
    );
  });

  it('출처가 없으면 뒤로가기 경로 없이 열린다 — 셸이 정적 backHref(?view=detail)로 대신한다', () => {
    render(<TeamMatchRecordEntry teamMatchId="match" detailOnly />);
    expect(screen.getByRole('link', { name: '공동 경기 기록 열기' })).toHaveAttribute('href', '/team-matches/match/record');
  });

  it('확정 결과의 득점 기록을 대회 결과 축으로 펼치고 일반 득점은 검정, 자책골은 빨강으로 표시한다', () => {
    state.data = {
      ...state.data,
      phase: 'official',
      canEdit: false,
      officialAt: state.data.serverTime,
      sides: [
        { id: 'home', key: 'HOME', name: '한강', score: 2 },
        { id: 'away', key: 'AWAY', name: '마포', score: 1 },
      ],
      goalEvents: [
        { sideId: 'home', participantName: '김민수', minute: 12, ownGoal: false, subMatchId: null },
        { sideId: 'away', participantName: '박지훈', minute: 18, ownGoal: false, subMatchId: null },
        { sideId: 'home', participantName: '박지훈', minute: 24, ownGoal: true, subMatchId: null },
      ],
    };
    const { container } = render(<TeamMatchRecordEntry teamMatchId="match" detailOnly />);
    const toggle = screen.getByRole('button', { name: '득점 기록 보기 (3)' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('link', { name: '공동 경기 기록 열기' })).toBeInTheDocument();

    fireEvent.click(toggle);

    expect(screen.getByRole('button', { name: '득점 기록 접기 (3)' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('list', { name: '득점 기록' })).toBeInTheDocument();
    expect(screen.getByRole('listitem', { name: '홈 12분 김민수 골' })).toBeInTheDocument();
    expect(screen.getByRole('listitem', { name: '원정 18분 박지훈 골' })).toBeInTheDocument();
    expect(screen.getByRole('listitem', { name: '홈 24분 박지훈 자책골' })).toBeInTheDocument();
    expect(screen.getByText('OG')).toBeInTheDocument();
    const goalMarkers = Array.from(container.querySelectorAll('[data-goal-marker="goal"]'));
    expect(goalMarkers).toHaveLength(2);
    for (const marker of goalMarkers) expect(marker).toHaveStyle({ color: 'var(--text-strong)' });
    const ownGoalMarkers = Array.from(container.querySelectorAll('[data-goal-marker="own-goal"]'));
    expect(ownGoalMarkers).toHaveLength(1);
    expect(ownGoalMarkers[0]).toHaveStyle({ color: 'var(--red500)' });
  });

  it('0대0 확정 결과는 빈 아코디언 대신 득점 없음 상태를 보여준다', () => {
    state.data = {
      ...state.data,
      phase: 'official',
      canEdit: false,
      officialAt: state.data.serverTime,
      goalEvents: [],
    };
    render(<TeamMatchRecordEntry teamMatchId="match" detailOnly />);
    expect(screen.getByText('등록된 득점이 없어요.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /득점 기록 보기/ })).not.toBeInTheDocument();
  });

  it('라이브 참가자는 받은 출처를 그대로 실은 경로로 자동 리다이렉트된다', () => {
    render(<TeamMatchRecordEntry teamMatchId="match" fromHref="/my/team-matches" />);
    expect(state.replace).toHaveBeenCalledWith(`/team-matches/match/record?from=${encodeURIComponent('/my/team-matches')}`);
  });

  // 회귀 방지: 뒤로가기로 `?view=detail`에 도착하면(detailOnly=true) 참가자·라이브여도
  // 다시 이 화면으로 리다이렉트하지 않아야 한다 — 안 그러면 뒤로가기가 replace→replace로
  // 제자리에 돌아와 아무 반응이 없어 보인다(2026-09-29 실사고, alpha 실측으로 확인).
  it('view=detail로 도착하면 참가자·라이브여도 다시 이 화면으로 리다이렉트하지 않는다', () => {
    render(<TeamMatchRecordEntry teamMatchId="match" detailOnly fromHref="/my/team-matches" />);
    expect(state.replace).not.toHaveBeenCalled();
  });

  it('공동 기록 이전 경기(legacy)는 출처를 실은 채 매치 상세로 넘긴다', () => {
    state.data = { ...state.data, phase: 'legacy' };
    state.search = `from=${encodeURIComponent('/users/u1/records')}`;
    render(<TeamMatchSharedRecord teamMatchId="match" />);
    expect(state.replace).toHaveBeenCalledWith(`/team-matches/match?view=detail&from=${encodeURIComponent('/users/u1/records')}`);
    expect(screen.queryByText('이 경기는 기존 경기 기록 화면에서 확인할 수 있어요.')).toBeNull();
  });

  it('운영 관리 경기(managed)도 출처가 없으면 매치 상세로만 넘긴다', () => {
    state.data = { ...state.data, phase: 'managed' };
    render(<TeamMatchSharedRecord teamMatchId="match" />);
    expect(state.replace).toHaveBeenCalledWith('/team-matches/match?view=detail');
  });

  it('공동 기록 경기(live)는 넘기지 않고 이 화면에서 기록을 보여준다', () => {
    state.search = `from=${encodeURIComponent('/users/u1/records')}`;
    render(<TeamMatchSharedRecord teamMatchId="match" />);
    expect(state.replace).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '득점 추가' })).toBeInTheDocument();
  });

  it('selects scorer from the credited team and sends the opened version with the goal', async () => {
    render(<TeamMatchSharedRecord teamMatchId="match" />);
    fireEvent.click(screen.getByRole('button', { name: '득점 추가' }));
    expect(screen.queryByRole('radio', { name: /박지훈/ })).toBeNull();
    fireEvent.click(screen.getByRole('radio', { name: /김민수/ }));
    fireEvent.change(screen.getByLabelText('득점 시간 (선택)'), { target: { value: '12' } });
    fireEvent.click(screen.getByRole('button', { name: '득점 등록' }));
    await waitFor(() => expect(state.mutate).toHaveBeenCalledWith(expect.objectContaining({ action: 'add', expectedVersion: 3, sideId: 'home', participantId: 'h1', minute: 12, ownGoal: false })));
  });
  it('shows player photos and offers the opposing roster for an own goal', () => {
    const { container } = render(<TeamMatchSharedRecord teamMatchId="match" />);
    fireEvent.click(screen.getByRole('button', { name: '득점 추가' }));
    expect(container.querySelector('img[src="/mock/players/minsu.jpg"]')).not.toBeNull();
    fireEvent.click(screen.getByRole('checkbox', { name: /자책골/ }));
    expect(screen.queryByRole('radio', { name: /김민수/ })).toBeNull();
    expect(screen.getByRole('radio', { name: /박지훈/ })).toBeInTheDocument();
  });
  it('득점 카드는 선수·팀·시간을 구분하고 수정·삭제를 별도 관리 영역으로 묶는다', () => {
    state.data = {
      ...state.data,
      sides: [
        { id: 'home', key: 'HOME', name: '한강 런너스 풀백 축구클럽', score: 1 },
        { id: 'away', key: 'AWAY', name: '마포', score: 0 },
      ],
      goals: [{ id: 'g1', sideId: 'home', participantId: 'h1', ownGoal: false, minute: 12, subMatchId: null }],
    };

    render(<TeamMatchSharedRecord teamMatchId="match" />);

    const goalRow = screen.getByRole('group', { name: '김민수 득점 기록' });
    expect(within(goalRow).getByText('김민수')).toBeInTheDocument();
    expect(within(goalRow).getByText('한강 런너스 풀백 축구클럽')).toBeInTheDocument();
    expect(within(goalRow).getByLabelText('득점 시간 12분')).toHaveTextContent('12분');
    const actions = screen.getByRole('group', { name: '김민수 득점 관리' });
    expect(within(actions).getByRole('button', { name: /수정$/ })).toBeInTheDocument();
    expect(within(actions).getByRole('button', { name: /삭제$/ })).toHaveClass('tm-btn-ghost');
  });
  it('does not overwrite a newer remote edit while a local form is open', () => {
    const { rerender } = render(<TeamMatchSharedRecord teamMatchId="match" />);
    fireEvent.click(screen.getByRole('button', { name: '득점 추가' }));
    fireEvent.click(screen.getByRole('radio', { name: /김민수/ }));
    state.data = { ...state.data, version: 4 };
    rerender(<TeamMatchSharedRecord teamMatchId="match" />);
    expect(screen.getByRole('radio', { name: /김민수/ })).toBeChecked();
    expect(screen.getByRole('button', { name: '득점 등록' })).toBeDisabled();
    expect(state.mutate).not.toHaveBeenCalled();
  });
  it('requires explicit end confirmation for the same record version', () => {
    const { rerender } = render(<TeamMatchSharedRecord teamMatchId="match" />);
    fireEvent.click(screen.getByRole('button', { name: '우리 팀 종료 확인' }));
    expect(state.mutate).not.toHaveBeenCalled();
    state.data = { ...state.data, version: 4 };
    rerender(<TeamMatchSharedRecord teamMatchId="match" />);
    expect(screen.getByRole('button', { name: '이 기록으로 종료 확인' })).toBeDisabled();
  });
  // L27 — 친선 결과 화면에는 "명단에서 나 찾기" 입구가 없어 게스트로 들어간 팀원이 자기 기록을 되찾을 길이 없었다.
  describe('명단에서 나 찾기 입구 (L27)', () => {
    it.each([
      ['참가팀 멤버', { participantMember: true }],
      ['호스트팀 운영진', { manageableHostTeam: true }],
      ['상대팀 운영진', { manageableOpponentTeam: true }],
    ])('확정된 경기에서 %s에게 보인다', (_label, viewer) => {
      claim.viewer = viewer;
      state.data = { ...state.data, phase: 'official', canEdit: false, participant: false };
      render(<TeamMatchSharedRecord teamMatchId="match" />);
      expect(screen.getByRole('button', { name: '명단에서 나 찾기 (match)' })).toBeInTheDocument();
    });

    it('진행 중인 경기에서도 보인다', () => {
      claim.viewer = { participantMember: true };
      render(<TeamMatchSharedRecord teamMatchId="match" />);
      expect(screen.getByRole('button', { name: /명단에서 나 찾기/ })).toBeInTheDocument();
    });

    it.each([
      ['참가팀이 아닌 사람', { participantMember: false, manageableHostTeam: false, manageableOpponentTeam: false }],
      ['뷰어 정보가 아직 없을 때', undefined],
    ])('%s에게는 보이지 않는다', (_label, viewer) => {
      claim.viewer = viewer;
      state.data = { ...state.data, phase: 'official', canEdit: false, participant: false };
      render(<TeamMatchSharedRecord teamMatchId="match" />);
      expect(screen.queryByRole('button', { name: /명단에서 나 찾기/ })).not.toBeInTheDocument();
    });

    it('취소된 경기와 어드민 화면에는 보이지 않는다', () => {
      claim.viewer = { participantMember: true };
      state.data = { ...state.data, phase: 'cancelled', canEdit: false };
      const { unmount } = render(<TeamMatchSharedRecord teamMatchId="match" />);
      expect(screen.queryByRole('button', { name: /명단에서 나 찾기/ })).not.toBeInTheDocument();
      unmount();

      state.data = { ...state.data, phase: 'official', participant: false, operator: true };
      render(<TeamMatchSharedRecord teamMatchId="match" admin />);
      expect(screen.queryByRole('button', { name: /명단에서 나 찾기/ })).not.toBeInTheDocument();
    });
  });

  // L30 — 취소된 경기의 공동 기록 화면에 "경기 종료 확인 · 확인 대기" 카드가 남았다.
  it('취소된 경기에는 종료 확인 카드가 없고 배지는 취소로 읽힌다', () => {
    state.data = { ...state.data, phase: 'cancelled', canEdit: false };
    render(<TeamMatchSharedRecord teamMatchId="match" />);
    expect(screen.getByText('취소된 경기')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '경기 종료 확인' })).not.toBeInTheDocument();
    expect(screen.queryByText('확인 대기')).not.toBeInTheDocument();
  });
  it('대조군 — 진행 중인 경기의 참가자는 종료 확인 카드를 본다', () => {
    render(<TeamMatchSharedRecord teamMatchId="match" />);
    expect(screen.getByRole('heading', { name: '경기 종료 확인' })).toBeInTheDocument();
    expect(screen.getAllByText('확인 대기')).toHaveLength(2);
  });
  it('removes all mutation controls when official or spectator', () => {
    state.data = { ...state.data, phase: 'official', canEdit: false, officialAt: state.data.serverTime };
    const { rerender } = render(<TeamMatchSharedRecord teamMatchId="match" />);
    expect(screen.queryByRole('button', { name: '득점 추가' })).toBeNull();
    expect(screen.getByText('결과가 확정되어 기록이 잠겼어요.')).toBeInTheDocument();
    state.data = { ...state.data, phase: 'live', participant: false };
    rerender(<TeamMatchSharedRecord teamMatchId="match" />);
    expect(screen.queryByRole('button', { name: '우리 팀 종료 확인' })).toBeNull();
  });
  // 2026-10-01 — 확정 뒤 편집 여부는 서버의 canEdit(플랫폼 어드민만 참)을 그대로 따른다.
  it('확정 뒤 어드민은 잠김 안내 대신 정정 안내를 보고, 득점을 고쳐 보낸다', async () => {
    state.data = {
      ...state.data, phase: 'official', canEdit: true, participant: false, operator: true, ownSideId: null,
      officialAt: state.data.serverTime,
      goals: [{ id: 'g1', sideId: 'home', participantId: 'h1', ownGoal: false, minute: 10, subMatchId: null }],
    };
    render(<TeamMatchSharedRecord teamMatchId="match" admin />);
    expect(screen.queryByText('결과가 확정되어 기록이 잠겼어요.')).toBeNull();
    expect(screen.getByText(/고칠 때마다 새 공식 결과로 남아/)).toBeInTheDocument();
    expect(screen.queryByText(/수정하면 기존 종료 확인이 초기화되며/)).toBeNull();
    expect(screen.queryByRole('heading', { name: '경기 종료 확인' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '득점 추가' }));
    fireEvent.change(screen.getByRole('combobox', { name: '득점 팀' }), { target: { value: 'away' } });
    fireEvent.click(screen.getByRole('button', { name: '득점 등록' }));
    await waitFor(() => expect(state.mutate).toHaveBeenCalledWith(expect.objectContaining({ action: 'add', sideId: 'away', expectedVersion: 3 })));
  });
  // W5-V5 — 운영자가 정정한 공식 결과를 "양 팀이 확인한" 결과라고 부르지 않는다(서버 officialCorrected).
  it.each([
    [true, '운영팀이 정정한 최종 결과', '양 팀이 확인한 최종 결과'],
    [false, '양 팀이 확인한 최종 결과', '운영팀이 정정한 최종 결과'],
  ])('확정 결과 머리말 — officialCorrected=%s 이면 "%s"', (officialCorrected, shown, hidden) => {
    state.data = { ...state.data, phase: 'official', canEdit: false, officialAt: state.data.serverTime, officialCorrected };
    render(<TeamMatchSharedRecord teamMatchId="match" />);
    const board = screen.getByRole('region', { name: '공동 점수판' });
    expect(within(board).getByText(shown)).toBeInTheDocument();
    expect(within(board).queryByText(hidden)).toBeNull();
  });
  // W5-V4 — 확정된 결과의 [삭제]·[이 변경 되돌리기]는 한 번에 새 공식 결과를 만든다(H9 A: 그 앞에만 확인 창).
  describe('확정 결과 정정 — 폼 없이 공식 결과를 바꾸는 버튼은 확인 창을 거친다', () => {
    const officialAdmin = () => {
      state.data = {
        ...state.data, phase: 'official', canEdit: true, participant: false, operator: true, ownSideId: null,
        officialAt: state.data.serverTime,
        goals: [{ id: 'g1', sideId: 'home', participantId: 'h1', ownGoal: false, minute: 10, subMatchId: null }],
        history: [{ id: 'c1', version: 3, action: 'add', actorName: 'Teameet 운영', goalId: 'g1', subMatchId: null, before: null, after: null, at: state.data.serverTime }],
      };
    };

    it('득점 삭제는 무엇이 바뀌는지 알린 뒤 [득점 삭제]를 눌러야 보낸다', async () => {
      officialAdmin();
      render(<TeamMatchSharedRecord teamMatchId="match" admin />);
      fireEvent.click(screen.getByRole('button', { name: /김민수.*삭제$/ }));

      const dialog = await screen.findByRole('dialog', { name: '득점을 삭제할까요?' });
      expect(dialog).toHaveTextContent('김민수 · 10분 득점을 지우면 새 공식 결과가 생기고 양 팀 전적과 개인 기록이 바로 바뀌어요.');
      expect(state.mutate).not.toHaveBeenCalled();

      fireEvent.click(within(dialog).getByRole('button', { name: '득점 삭제' }));
      await waitFor(() => expect(state.mutate).toHaveBeenCalledWith(expect.objectContaining({ action: 'delete', goalId: 'g1', expectedVersion: 3 })));
    });

    it('[취소]하면 아무것도 보내지 않는다', async () => {
      officialAdmin();
      render(<TeamMatchSharedRecord teamMatchId="match" admin />);
      fireEvent.click(screen.getByRole('button', { name: /김민수.*삭제$/ }));
      fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '취소' }));

      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      expect(state.mutate).not.toHaveBeenCalled();
    });

    it('변경 되돌리기도 확인 뒤에만 보낸다', async () => {
      officialAdmin();
      render(<TeamMatchSharedRecord teamMatchId="match" admin />);
      fireEvent.click(screen.getByRole('button', { name: '이 변경 되돌리기' }));

      const dialog = await screen.findByRole('dialog', { name: '이 변경을 되돌릴까요?' });
      expect(dialog).toHaveTextContent('새 공식 결과가 생기고 양 팀 전적과 개인 기록이 바로 바뀌어요.');
      expect(state.mutate).not.toHaveBeenCalled();
      fireEvent.click(within(dialog).getByRole('button', { name: '변경 되돌리기' }));
      await waitFor(() => expect(state.mutate).toHaveBeenCalledWith(expect.objectContaining({ action: 'undo', changeId: 'c1', expectedVersion: 3 })));
    });

    it('대조군 — 진행 중인 공동 기록의 삭제는 확인 없이 바로 보낸다', async () => {
      state.data.goals = [{ id: 'g1', sideId: 'home', participantId: 'h1', ownGoal: false, minute: 10, subMatchId: null }];
      render(<TeamMatchSharedRecord teamMatchId="match" />);
      fireEvent.click(screen.getByRole('button', { name: /김민수.*삭제$/ }));

      await waitFor(() => expect(state.mutate).toHaveBeenCalledWith(expect.objectContaining({ action: 'delete', goalId: 'g1' })));
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });
  it('flags a potentially duplicate goal instead of blindly adding it', () => {
    state.data.goals = [{ id: 'g1', sideId: 'home', participantId: null, ownGoal: false, minute: null, subMatchId: null }];
    render(<TeamMatchSharedRecord teamMatchId="match" />);
    fireEvent.click(screen.getByRole('button', { name: '득점 추가' }));
    expect(screen.getByRole('button', { name: '득점 등록' })).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox', { name: /별개의 득점/ }));
    expect(screen.getByRole('button', { name: '득점 등록' })).toBeEnabled();
  });
  it('shows the aggregate and assigns a new goal to the selected submatch', async () => {
    state.data = {
      ...state.data,
      sides: [{ id: 'home', key: 'HOME', name: '서강', score: 3 }, { id: 'away', key: 'AWAY', name: '마포', score: 2 }],
      subMatches: [
        { id: '11111111-1111-4111-8111-111111111111', title: '1경기', order: 0, scores: [{ sideId: 'home', score: 2 }, { sideId: 'away', score: 1 }] },
        { id: '22222222-2222-4222-8222-222222222222', title: '2경기', order: 1, scores: [{ sideId: 'home', score: 1 }, { sideId: 'away', score: 1 }] },
      ],
    };
    render(<TeamMatchSharedRecord teamMatchId="match" />);
    expect(screen.getByLabelText('점수 3 대 2')).toBeInTheDocument();
    expect(screen.getByLabelText('1경기 점수 2 대 1')).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: '이 서브매치에 득점 추가' })[1]);
    fireEvent.click(screen.getByRole('button', { name: '득점 등록' }));
    await waitFor(() => expect(state.mutate).toHaveBeenCalledWith(expect.objectContaining({
      action: 'add', subMatchId: '22222222-2222-4222-8222-222222222222', expectedVersion: 3,
    })));
  });

  it('replaces the submatch heading with its rename form', () => {
    state.data = {
      ...state.data,
      subMatches: [{ id: '11111111-1111-4111-8111-111111111111', title: '1경기', order: 0, scores: [{ sideId: 'home', score: 0 }, { sideId: 'away', score: 0 }] }],
    };
    render(<TeamMatchSharedRecord teamMatchId="match" />);
    fireEvent.click(screen.getByRole('button', { name: '이름 수정' }));
    expect(screen.getByRole('form', { name: '1경기 이름 변경' })).toBeInTheDocument();
    expect(screen.getByLabelText('서브매치 이름')).toHaveValue('1경기');
    expect(screen.queryByText('1경기')).toBeNull();
  });

  it('creates an optional submatch without removing the shared participant controls', async () => {
    render(<TeamMatchSharedRecord teamMatchId="match" />);
    fireEvent.click(screen.getByRole('button', { name: '서브매치 추가' }));
    fireEvent.change(screen.getByLabelText('서브매치 이름'), { target: { value: '전반전' } });
    fireEvent.click(screen.getByRole('button', { name: '서브매치 만들기' }));
    await waitFor(() => expect(state.mutate).toHaveBeenCalledWith(expect.objectContaining({ action: 'submatch_add', title: '전반전', expectedVersion: 3 })));
    expect(screen.getByRole('button', { name: '우리 팀 종료 확인' })).toBeInTheDocument();
  });
});

describe('H5 — 기록 화면의 팀장 권한·게스트·공개 득점·늦게 온 선수', () => {
  it('명단 밖 팀장·매니저는 "팀장 권한" 표시를 보고, 명단 안 참가자에게는 없다(대조군)', () => {
    state.data = { ...state.data, teamAuthority: true };
    const { unmount } = render(<TeamMatchSharedRecord teamMatchId="match" />);
    expect(screen.getByText('팀장 권한')).toBeInTheDocument();
    expect(screen.getByText(/명단에 없어도 기록하고 종료를 확인할 수 있어요/)).toBeInTheDocument();
    unmount();

    state.data = { ...state.data, teamAuthority: false };
    render(<TeamMatchSharedRecord teamMatchId="match" />);
    expect(screen.queryByText('팀장 권한')).not.toBeInTheDocument();
  });

  it('L22: 게스트 득점자는 칩과 "개인 기록엔 안 남아요"로 구분하고, 계정 있는 선수에게는 붙이지 않는다', () => {
    state.data.participants = [
      { id: 'h1', sideId: 'home', name: '김민수', jerseyNumber: 7, profileImageUrl: null, guest: false },
      { id: 'hg', sideId: 'home', name: '선수07게스트', jerseyNumber: null, profileImageUrl: null, guest: true },
    ];
    state.data.goals = [
      { id: 'g1', sideId: 'home', participantId: 'h1', ownGoal: false, minute: 3, subMatchId: null },
      { id: 'g2', sideId: 'home', participantId: 'hg', ownGoal: false, minute: 8, subMatchId: null },
    ];
    render(<TeamMatchSharedRecord teamMatchId="match" />);
    const guestRow = within(screen.getByRole('group', { name: '선수07게스트 득점 기록' }));
    expect(guestRow.getByText('게스트')).toBeInTheDocument();
    expect(guestRow.getByText('개인 기록엔 안 남아요')).toBeInTheDocument();
    const memberRow = within(screen.getByRole('group', { name: '김민수 득점 기록' }));
    expect(memberRow.queryByText('게스트')).not.toBeInTheDocument();
  });

  it('W2-V9: 명단 밖 팀원·관전자는 확정 득점을 읽기 전용으로 보고, 편집·변경 이력은 여전히 없다', () => {
    state.data = {
      ...state.data,
      phase: 'official', canEdit: false, participant: false, officialAt: state.data.serverTime,
      participants: [], goals: [], history: [],
      sides: [{ id: 'home', key: 'HOME', name: '한강', score: 1 }, { id: 'away', key: 'AWAY', name: '마포', score: 1 }],
      goalEvents: [
        { sideId: 'home', participantName: '선수07게스트', minute: 8, ownGoal: false, subMatchId: null },
        { sideId: 'away', participantName: '박지훈', minute: 20, ownGoal: false, subMatchId: null },
      ],
    };
    render(<TeamMatchSharedRecord teamMatchId="match" />);
    expect(screen.getByRole('listitem', { name: '홈 8분 선수07게스트 골' })).toBeInTheDocument();
    expect(screen.getByRole('listitem', { name: '원정 20분 박지훈 골' })).toBeInTheDocument();
    expect(screen.queryByText('참가자들의 공동 기록으로 점수가 갱신돼요.')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /수정|삭제|득점 추가|종료 확인/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/변경 이력/)).not.toBeInTheDocument();
  });

  it('대조군 — 참가자는 공개 목록이 아니라 편집할 수 있는 득점 행을 본다', () => {
    state.data.goals = [{ id: 'g1', sideId: 'home', participantId: 'h1', ownGoal: false, minute: 3, subMatchId: null }];
    state.data.goalEvents = [{ sideId: 'home', participantName: '김민수', minute: 3, ownGoal: false, subMatchId: null }];
    render(<TeamMatchSharedRecord teamMatchId="match" />);
    expect(screen.getByRole('group', { name: '김민수 득점 기록' })).toBeInTheDocument();
    expect(screen.queryByRole('listitem', { name: /김민수 골/ })).not.toBeInTheDocument();
  });

  const lateLineup = (overrides: Record<string, unknown> = {}) => ({
    sideId: 'home', lateAdditionAllowed: true,
    starters: [{ id: 'h1', userId: 'u-1', displayName: '김민수', jerseyNumber: 7, position: null, goalkeeper: false, positionX: null, positionY: null }],
    bench: [],
    eligibleMembers: [
      { userId: 'u-1', displayName: '김민수', jerseyNumber: 7, attending: true },
      { userId: 'u-2', displayName: '늦은 선수', jerseyNumber: 7, attending: true },
      { userId: 'u-3', displayName: '다른 선수', jerseyNumber: 5, attending: true },
    ],
    ...overrides,
  });

  it('A-4: 팀장·매니저는 경기 중 "늦게 온 선수 추가"로 명단에 없는 팀원만 고르고, 겹치는 번호는 싣지 않는다', () => {
    claim.viewer = { manageableHostTeam: true };
    lineup.data = lateLineup();
    state.data = { ...state.data, participant: true, teamAuthority: true };
    render(<TeamMatchSharedRecord teamMatchId="match" />);

    expect(screen.getByRole('heading', { name: '우리 팀 명단 1명' })).toBeInTheDocument();
    expect(screen.getByText('나는 이 경기 명단에 없어요.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '늦게 온 선수 추가' }));
    const sheet = within(screen.getByRole('dialog', { name: '늦게 온 선수 추가' }));
    expect(sheet.queryByRole('button', { name: '김민수 명단에 추가' })).not.toBeInTheDocument();
    // 다른 선수(5번)가 번호순으로 먼저, 김민수와 번호가 겹치는 늦은 선수는 번호 없이 붙는다(서버 422 회피).
    const names = sheet.getAllByRole('button', { name: /명단에 추가$/ }).map((button) => button.getAttribute('aria-label'));
    expect(names).toEqual(['다른 선수 명단에 추가', '늦은 선수 명단에 추가', '게스트 명단에 추가']);
    fireEvent.click(sheet.getByRole('button', { name: '늦은 선수 명단에 추가' }));
    expect(lineup.add).toHaveBeenCalledWith(expect.objectContaining({ payload: { userId: 'u-2' } }), expect.anything());
  });

  it.each([
    ['팀장·매니저가 아니면 명단을 조회하지도 않는다', { participantMember: true }, lateLineup()],
    ['추가 창이 닫혀 있으면(결과 확정 등) 입구가 없다', { manageableHostTeam: true }, lateLineup({ lateAdditionAllowed: false })],
  ])('대조군 — %s', (_label, viewer, data) => {
    claim.viewer = viewer;
    lineup.data = data;
    render(<TeamMatchSharedRecord teamMatchId="match" />);
    expect(screen.queryByRole('button', { name: '늦게 온 선수 추가' })).not.toBeInTheDocument();
    if (!('manageableHostTeam' in viewer)) expect(lineup.calls.every((call) => call.enabled === false)).toBe(true);
  });
});
