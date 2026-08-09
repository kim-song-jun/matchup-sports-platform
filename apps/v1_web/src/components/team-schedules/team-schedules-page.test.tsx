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

function buildModel(overrides: Partial<ScheduleDetailViewModel['manage']>): ScheduleDetailViewModel {
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
    attendees: { visible: false, items: [], counts: { all: 0, going: 0, noResponse: 0 } },
    guestRecruitment: {
      visible: false,
      slots: 0,
      applicantCount: 0,
      approvedCount: 0,
      closesAtLabel: '',
      note: null,
      stateLabel: '',
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
