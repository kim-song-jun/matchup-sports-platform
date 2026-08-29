import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ScheduleDetailPageView } from './team-schedules-page';
import type { ScheduleDetailViewModel } from './team-schedules.types';

vi.mock('next/navigation', () => ({
  usePathname: () => '/teams/team-1/schedules/schedule-1',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

function renderPage(ui: ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

function buildModel(
  overrides: Partial<ScheduleDetailViewModel['manage']>,
  attendeesOverrides: Partial<ScheduleDetailViewModel['attendees']> = {},
): ScheduleDetailViewModel {
  return {
    teamId: 'team-1',
    scheduleId: 'schedule-1',
    backHref: '/teams/team-1/schedules',
    title: '토요일 정기훈련',
    typeLabel: '정기훈련',
    stateLabel: '예정',
    stateTone: 'default',
    state: 'SCHEDULED',
    dateTimeLabel: '5월 11일 09:00-11:00',
    visibilityLabel: '팀 전체',
    capacityLabel: null,
    version: 1,
    conflictBanner: null,
    onDismissConflict: () => undefined,
    history: [],
    attendance: {
      visible: false,
      myStatus: null,
      waitlistPosition: null,
      counts: { going: 0, waitlisted: 0 },
      deadlineLabel: null,
      deadlinePassed: false,
      disabled: true,
      disabledReason: null,
      pending: false,
      error: null,
      onSetStatus: () => undefined,
    },
    attendees: {
      visible: false,
      items: [],
      counts: { all: 0, going: 0, noResponse: 0 },
      canProxy: false,
      proxyPendingUserId: null,
      proxyError: null,
      viewerUserId: null,
      onProxyGoing: () => undefined,
      ...attendeesOverrides,
    },
    guestRecruitment: {
      visible: false,
      slots: 0,
      applicantCount: 0,
      approvedCount: 0,
      closesAtLabel: '',
      note: null,
      stateLabel: '',
      visibilityLabel: '',
      isOpen: false,
    },
    manage: {
      visible: true,
      editHref: '/teams/team-1/schedules/schedule-1/edit',
      onCancel: () => undefined,
      onComplete: () => undefined,
      canComplete: false,
      completeDisabledReason: null,
      cancelPending: false,
      completePending: false,
      reminders: [],
      ...overrides,
    },
    cancelModal: {
      open: false,
      reason: '',
      onReasonChange: () => undefined,
      onConfirm: () => undefined,
      onDismiss: () => undefined,
      pending: false,
      error: null,
    },
    loading: false,
    error: false,
    onRetry: () => undefined,
  };
}

describe('일정 상세 — 완료 처리 버튼', () => {
  it('경기가 끝나기 전에는 버튼을 감추지 않고 disabled + 사유로 보여준다', () => {
    const model = buildModel({
      canComplete: false,
      completeDisabledReason: '경기가 끝난 뒤에 완료 처리할 수 있어요.',
    });

    renderPage(<ScheduleDetailPageView model={model} />);

    const button = screen.getByRole('button', { name: '완료 처리' });
    expect(button).toBeDisabled();
    expect(screen.getByText('경기가 끝난 뒤에 완료 처리할 수 있어요.')).toBeInTheDocument();
  });

  it('완료 처리가 가능하면 버튼이 활성화되고 사유 문구는 보이지 않는다', () => {
    const model = buildModel({ canComplete: true, completeDisabledReason: null });

    renderPage(<ScheduleDetailPageView model={model} />);

    const button = screen.getByRole('button', { name: '완료 처리' });
    expect(button).not.toBeDisabled();
    expect(screen.queryByText('경기가 끝난 뒤에 완료 처리할 수 있어요.')).not.toBeInTheDocument();
  });
});

describe('일정 상세 — 팀장 대리 참석 표시', () => {
  const attendee = (userId: string, nickname: string, status: 'GOING' | 'NO_RESPONSE') => ({
    userId,
    nickname,
    profileImageUrl: null,
    status,
  });

  function renderAttendees(overrides: Partial<ScheduleDetailViewModel['attendees']>) {
    const model = buildModel({ visible: false }, {
      visible: true,
      items: [attendee('u-1', '미응답이', 'NO_RESPONSE'), attendee('u-2', '참석했다', 'GOING')],
      counts: { all: 2, going: 1, noResponse: 1 },
      ...overrides,
    });
    renderPage(<ScheduleDetailPageView model={model} />);
    return model;
  }

  it('팀장에게는 미응답 팀원에만 대리 표시 버튼이 뜬다', () => {
    // 뷰어는 목록에 없는 제3자(팀장) — 자기 줄 규칙과 섞이지 않게 명시한다.
    renderAttendees({ canProxy: true, viewerUserId: 'u-me' });
    // 이미 응답한 사람의 의사를 팀장이 덮어쓰지 않는다.
    expect(screen.getByRole('button', { name: '미응답이 참석으로 대신 표시' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '참석했다 참석으로 대신 표시' })).toBeNull();
  });

  it('보고 있는 본인의 줄에는 대리 버튼이 뜨지 않는다', () => {
    // 참석자 목록은 active 멤버 전원이라 팀장 자신의 줄도 거기 있다. 자기 줄에까지
    // "대신 표시"가 뜨면 위쪽 "내 참석"과 같은 일을 하는 버튼이 두 개가 된다
    // (alpha 실화면에서 확인).
    renderAttendees({ canProxy: true, viewerUserId: 'u-1' });
    expect(screen.queryByRole('button', { name: '미응답이 참석으로 대신 표시' })).toBeNull();
  });

  it('viewerUserId 를 아직 모르면 어느 줄에도 버튼을 내지 않는다', () => {
    // 잠깐 안 보이는 쪽이, 자기 줄에 잘못 떴다가 사라지는 쪽보다 낫다.
    renderAttendees({ canProxy: true, viewerUserId: null });
    expect(screen.queryByRole('button', { name: /참석으로 대신 표시/ })).toBeNull();
  });

  it('권한이 없으면 버튼 자체가 렌더되지 않는다', () => {
    // 서버도 403 으로 막지만, 누를 수 없는 버튼을 보여주고 눌러서 실패하게 두지 않는다.
    renderAttendees({ canProxy: false });
    expect(screen.queryByRole('button', { name: /참석으로 대신 표시/ })).toBeNull();
  });

  it('대리 표시 중에는 버튼이 비활성화되고 진행 상태를 알린다', () => {
    renderAttendees({ canProxy: true, viewerUserId: 'u-me', proxyPendingUserId: 'u-1' });
    const button = screen.getByRole('button', { name: '미응답이 참석으로 대신 표시' });
    expect(button).toBeDisabled();
    expect(button).toHaveTextContent('처리 중…');
  });

  it('대리 표시가 실패하면 사유를 알리되 목록은 그대로 둔다', () => {
    renderAttendees({ canProxy: true, viewerUserId: 'u-me', proxyError: '참석을 대신 표시하지 못했어요.' });
    expect(screen.getByRole('alert')).toHaveTextContent('참석을 대신 표시하지 못했어요.');
    expect(screen.getByText('미응답이')).toBeInTheDocument();
  });
});
