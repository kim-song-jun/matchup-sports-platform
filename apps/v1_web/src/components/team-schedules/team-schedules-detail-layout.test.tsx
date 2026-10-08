import { fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ScheduleDetailPageView } from './team-schedules-page';
import type { ScheduleDetailViewModel } from './team-schedules.types';

vi.mock('next/navigation', () => ({
  usePathname: () => '/teams/team-1/schedules/schedule-1',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

function detailModel(): ScheduleDetailViewModel {
  return {
    teamId: 'team-1', scheduleId: 'schedule-1', backHref: '/teams/team-1/schedules',
    title: '토요일 정기훈련', typeLabel: '정기훈련', stateLabel: '예정', stateTone: 'default',
    state: 'SCHEDULED', dateTimeLabel: '10월 10일 09:00-11:00', visibilityLabel: '팀 전체',
    capacityLabel: null, opponent: null, roster: null, version: 1,
    conflictBanner: null, onDismissConflict: () => undefined,
    history: [{ label: '시간 변경', detail: '오전 9시로 바꿨어요.' }],
    attendance: {
      visible: true, myStatus: 'GOING', waitlistPosition: null,
      counts: { going: 1, waitlisted: 0 }, deadlineLabel: null, deadlinePassed: false,
      disabled: false, disabledReason: null, pending: false, error: null,
      onSetStatus: () => undefined, friendlyMatch: false,
    },
    attendees: {
      visible: true,
      items: [
        { userId: 'me', nickname: '참석한 팀원', profileImageUrl: null, status: 'GOING' },
        { userId: 'other', nickname: '이름이아주길어도응답을확인해야하는팀원', profileImageUrl: null, status: 'NO_RESPONSE' },
      ],
      counts: { all: 2, going: 1, noResponse: 1 }, canProxy: true,
      proxyPendingUserId: null, proxyError: null, viewerUserId: 'me', onProxyGoing: () => undefined,
    },
    guestRecruitment: {
      visible: true, slots: 2, applicantCount: 1, approvedCount: 0,
      closesAtLabel: '10월 9일 마감', note: null, stateLabel: '모집 중', visibilityLabel: '전체 공개', isOpen: true,
      manage: {
        onCreate: () => undefined, onToggleOpen: () => undefined, onEdit: () => undefined,
        pending: false, exists: true, scheduleActive: true,
        applications: {
          items: [], loading: false, error: null, onApprove: () => undefined,
          onReject: () => undefined, pendingApplicationId: null,
        },
      },
    },
    manage: {
      visible: true, editHref: '/teams/team-1/schedules/schedule-1/edit',
      onCancel: () => undefined, onComplete: () => undefined, canComplete: false,
      completeDisabledReason: '훈련이 끝난 뒤에 완료 처리할 수 있어요.',
      cancelPending: false, completePending: false,
      reminders: [{ kind: 'rsvp_deadline', label: '미응답 알림 보내기', visible: true, pending: false, onTrigger: () => undefined }],
    },
    cancelModal: {
      open: false, noticeLine: '팀원에게 알림이 가요.', reason: '', onReasonChange: () => undefined,
      onConfirm: () => undefined, onDismiss: () => undefined, pending: false, error: null,
    },
    loading: false, error: false, inaccessible: false, onRetry: () => undefined,
  };
}

function renderDetail(model: ScheduleDetailViewModel) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Consumer() {
    const [status, setStatus] = useState(model.attendance.myStatus);
    return <ScheduleDetailPageView model={{ ...model, attendance: { ...model.attendance, myStatus: status, onSetStatus: setStatus } }} />;
  }
  return render(<QueryClientProvider client={client}><Consumer /></QueryClientProvider>);
}

describe('일정 상세 정보 구조 — 실제 상세 뷰 소비자', () => {
  it('관리자가 조회 필터를 바꿀 때 내 응답과 별도 영역의 관리 기능을 유지한다', () => {
    // Given: 응답한 본인과 미응답 팀원이 있는 관리자 상세예요.
    renderDetail(detailModel());
    const response = screen.getByRole('region', { name: '내 참석' });
    const attendance = screen.getByRole('region', { name: '참석 현황' });
    const management = screen.getByRole('complementary', { name: '모집 및 운영' });
    expect(response).not.toContainElement(attendance);
    expect(management).not.toContainElement(attendance);
    const filters = within(attendance).getByRole('group', { name: '참석 현황 필터' });

    // When: 조회 대상만 미응답으로 좁혀요.
    fireEvent.click(within(filters).getByRole('button', { name: '미응답 1' }));

    // Then: 개인 응답은 그대로이고 현황에 미응답자의 상태와 대리 액션이 남아요.
    expect(within(response).getByRole('button', { name: '참석' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(filters).getByRole('button', { name: '미응답 1' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(attendance).queryByText('참석한 팀원')).not.toBeInTheDocument();
    const row = within(attendance).getByRole('listitem');
    expect(row).toHaveTextContent('이름이아주길어도응답을확인해야하는팀원');
    expect(within(row).getByText('미응답')).toBeInTheDocument();
    expect(within(row).getByRole('button', { name: /참석으로 대신 표시/ })).toBeEnabled();
    expect(within(management).getByRole('region', { name: '용병 모집' })).toBeInTheDocument();
    expect(within(management).getByRole('button', { name: '완료 처리' })).toBeDisabled();
    expect(within(management).getByRole('button', { name: '미응답 알림 보내기' })).toBeEnabled();
  });

  it('멤버가 내 응답을 바꿀 때 현황의 조회 선택과 관리 권한을 유지한다', () => {
    // Given: 운영 권한과 모집 정보가 없는 멤버 상세예요.
    const model = detailModel();
    renderDetail({ ...model, manage: { ...model.manage, visible: false }, guestRecruitment: { ...model.guestRecruitment, visible: false, manage: undefined }, attendees: { ...model.attendees, canProxy: false } });
    const response = screen.getByRole('region', { name: '내 참석' });
    const attendance = screen.getByRole('region', { name: '참석 현황' });

    // When: 내 응답을 미정으로 바꿔요.
    fireEvent.click(within(response).getByRole('button', { name: '미정' }));

    // Then: 조회는 전체로 남고 관리자 전용 영역과 대리 액션은 나오지 않아요.
    expect(within(response).getByRole('button', { name: '미정' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(attendance).getByRole('button', { name: '전체 2' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    expect(within(attendance).queryByRole('button', { name: /대신 표시/ })).not.toBeInTheDocument();
  });

  it('응답이 잠기고 현황이 비어 있을 때 실제 상태와 운영 사유를 각 영역에 보인다', () => {
    // Given: 응답 마감과 실제 빈 참석 현황이 있는 상세예요.
    const model = detailModel();

    // When: 잠긴 상세를 렌더해요.
    renderDetail({ ...model, attendance: { ...model.attendance, disabled: true, disabledReason: '참석 응답이 마감됐어요.', error: '응답을 저장하지 못했어요.' }, attendees: { ...model.attendees, items: [], counts: { all: 0, going: 0, noResponse: 0 } } });

    // Then: 선택된 응답과 실패·마감 사유를 유지하고 조회 영역은 빈 상태를 보여줘요.
    const response = screen.getByRole('region', { name: '내 참석' });
    expect(within(response).getByRole('button', { name: '참석' })).toBeDisabled();
    expect(within(response).getByRole('button', { name: '참석' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(response).getByRole('status')).toHaveTextContent('참석 응답이 마감됐어요.');
    expect(within(response).getByRole('alert')).toHaveTextContent('응답을 저장하지 못했어요.');
    expect(within(screen.getByRole('region', { name: '참석 현황' })).getByText('해당하는 팀원이 없어요.')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: '운영 관리' })).getByRole('button', { name: '완료 처리' })).toHaveAccessibleDescription('훈련이 끝난 뒤에 완료 처리할 수 있어요.');
  });
});
