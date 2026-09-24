import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render as rtlRender, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MyInvitationsPageView, MyJoinApplicationsPageView, MyMatchesPageView, MyTeamsPageView } from './my-page';
import type {
  MyInvitationsViewModel,
  MyJoinApplicationItem,
  MyJoinApplicationsViewModel,
  MyMatchesViewModel,
  MyTeam,
} from './my.types';

vi.mock('next/navigation', () => ({
  usePathname: () => '/my/invitations',
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
}));

function render(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return rtlRender(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

function baseModel(overrides: Partial<MyInvitationsViewModel> = {}): MyInvitationsViewModel {
  return {
    invitations: [],
    error: false,
    onAccept: vi.fn(),
    onDecline: vi.fn(),
    onRetry: vi.fn(),
    ...overrides,
  };
}

describe('MyInvitationsPageView — 받은 초대 아이템별 처리 상태', () => {
  it('처리 중인 초대 카드만 버튼이 비활성화되고 "처리 중…" 문구가 뜬다 (전역 잠금 회귀 방지)', () => {
    const onAccept = vi.fn();
    const model = baseModel({
      invitations: [
        {
          invitationId: 'inv-a',
          teamId: 'team-a',
          teamName: '성수 러너스 FC',
          logoUrl: null,
          invitedByName: '김도윤',
          message: null,
          dateLabel: '7월 1일',
          actionPending: true,
        },
        {
          invitationId: 'inv-b',
          teamId: 'team-b',
          teamName: '마포 농구 클럽',
          logoUrl: null,
          invitedByName: '박서준',
          message: null,
          dateLabel: '7월 2일',
          actionPending: false,
        },
      ],
      onAccept,
    });

    render(<MyInvitationsPageView model={model} />);

    expect(screen.getByText('처리 중…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '성수 러너스 FC 초대 수락' })).toBeDisabled();

    // 처리 중이 아닌 다른 카드의 버튼은 여전히 눌러야 한다 — 전역 boolean이면 여기도 잠겨서 실패한다.
    const activeAcceptButton = screen.getByRole('button', { name: '마포 농구 클럽 초대 수락' });
    expect(activeAcceptButton).not.toBeDisabled();

    fireEvent.click(activeAcceptButton);
    expect(onAccept).toHaveBeenCalledWith('inv-b');
  });

  it('조회 실패 시 에러+재시도 UI를 보여준다', () => {
    const onRetry = vi.fn();
    const model = baseModel({ error: true, onRetry });

    render(<MyInvitationsPageView model={model} />);

    // 2026-09-04 감사: 오류를 EmptyState(회색 인박스, role 없음)로 그리던 것을 ErrorState 로 바꿨다 —
    // 스크린리더가 오류로 읽도록 role="alert" 를 함께 못박는다.
    expect(screen.getByRole('alert')).toHaveTextContent('초대 목록을 불러오지 못했어요');
    fireEvent.click(screen.getByRole('button', { name: '다시 불러오기' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

describe('MyJoinApplicationsPageView — 보낸 가입 신청 상태 표시', () => {
  function joinApplication(overrides: Partial<MyJoinApplicationItem> = {}): MyJoinApplicationItem {
    return {
      applicationId: 'app-a',
      teamId: 'team-a',
      teamName: '성수 러너스 FC',
      logoUrl: null,
      status: 'requested',
      statusLabel: '승인 대기',
      statusTone: 'pending',
      statusHint: '관리자가 확인하고 있어요. 승인되면 알림으로 알려드릴게요.',
      message: null,
      dateLabel: '7월 1일',
      actionPending: false,
      ...overrides,
    };
  }

  function applicationsModel(
    overrides: Partial<MyJoinApplicationsViewModel> = {},
  ): MyJoinApplicationsViewModel {
    return {
      applications: [],
      loading: false,
      error: false,
      onWithdraw: vi.fn(),
      onRetry: vi.fn(),
      ...overrides,
    };
  }

  it('승인 대기 건에만 취소 버튼이 붙고, 처리된 건은 결과만 보여준다', () => {
    const onWithdraw = vi.fn();
    const model = applicationsModel({
      applications: [
        joinApplication(),
        joinApplication({
          applicationId: 'app-b',
          teamId: 'team-b',
          teamName: '마포 농구 클럽',
          status: 'rejected',
          statusLabel: '거절됨',
          statusTone: 'rejected',
          statusHint: '이번에는 승인되지 않았어요. 다시 신청할 수 있어요.',
        }),
      ],
      onWithdraw,
    });

    render(<MyJoinApplicationsPageView model={model} />);

    // 상태는 색이 아니라 텍스트로도 구분돼야 한다(색만으로 정보 전달 금지).
    expect(screen.getByText('승인 대기')).toBeInTheDocument();
    expect(screen.getByText('거절됨')).toBeInTheDocument();
    expect(screen.getByText('이번에는 승인되지 않았어요. 다시 신청할 수 있어요.')).toBeInTheDocument();

    // 이미 처리된 신청은 취소할 수 없다 — 버튼 자체가 없어야 한다.
    expect(screen.queryByRole('button', { name: '마포 농구 클럽 가입 신청 취소' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '성수 러너스 FC 가입 신청 취소' }));
    expect(onWithdraw).toHaveBeenCalledWith('app-a');
  });

  it('취소 처리 중인 카드의 버튼만 비활성화된다', () => {
    const model = applicationsModel({
      applications: [
        joinApplication({ actionPending: true }),
        joinApplication({ applicationId: 'app-b', teamId: 'team-b', teamName: '마포 농구 클럽' }),
      ],
    });

    render(<MyJoinApplicationsPageView model={model} />);

    expect(screen.getByRole('button', { name: '성수 러너스 FC 가입 신청 취소' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '마포 농구 클럽 가입 신청 취소' })).not.toBeDisabled();
  });

  it('팀 링크에 뒤로가기 출처(from=/my/join-applications)를 담는다', () => {
    const model = applicationsModel({ applications: [joinApplication()] });

    render(<MyJoinApplicationsPageView model={model} />);

    expect(screen.getByRole('link', { name: '성수 러너스 FC' })).toHaveAttribute(
      'href',
      '/teams/team-a?from=%2Fmy%2Fjoin-applications',
    );
  });
});

describe('MyMatchesPageView — 빈 상태 CTA 출처', () => {
  function matchesModel(overrides: Partial<MyMatchesViewModel> = {}): MyMatchesViewModel {
    return {
      mode: 'created',
      summary: [],
      matches: [],
      loading: false,
      error: false,
      onRetry: vi.fn(),
      ...overrides,
    };
  }

  it('생성한 매치가 없으면 "매치 만들기" CTA에 from=/my/matches/created 를 담는다', () => {
    render(<MyMatchesPageView model={matchesModel({ mode: 'created' })} />);

    expect(screen.getByRole('link', { name: '매치 만들기' })).toHaveAttribute(
      'href',
      '/matches/new/sport?from=%2Fmy%2Fmatches%2Fcreated',
    );
  });

  it('회귀 방지: 참여 매치 빈 상태의 "매치 둘러보기" CTA는 from 없이 /matches 그대로다', () => {
    render(<MyMatchesPageView model={matchesModel({ mode: 'joined' })} />);

    expect(screen.getByRole('link', { name: '매치 둘러보기' })).toHaveAttribute('href', '/matches');
  });
});

describe('MyTeamsPageView — 팀 카드 출처', () => {
  function team(overrides: Partial<MyTeam> = {}): MyTeam {
    return {
      id: 'team-1',
      name: '성수 FC',
      logo: '',
      logoUrl: null,
      sport: '풋살',
      region: '성동구',
      role: 'member',
      roleLabel: '멤버',
      members: 12,
      manner: '4.5',
      next: '다음 경기 없음',
      description: '',
      ...overrides,
    };
  }

  it('팀 카드는 뒤로가기가 내 팀 목록으로 돌아오도록 출처를 담는다', () => {
    render(<MyTeamsPageView model={{ teams: [team()], summary: [] }} />);

    expect(screen.getByRole('link', { name: /성수 FC/ })).toHaveAttribute('href', '/teams/team-1?from=%2Fmy%2Fteams');
  });
});
