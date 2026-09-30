import { fireEvent, render, screen } from '@testing-library/react';
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
  attendanceOverrides: Partial<ScheduleDetailViewModel['attendance']> = {},
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
    opponent: null,
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
      friendlyMatch: false,
      ...attendanceOverrides,
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
    inaccessible: false,
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

describe('일정 상세 — 접근 불가', () => {
  it('멤버 전용 일정이 숨겨진 사람에게는 재시도 없이 팀 상세로 돌아갈 길을 준다', () => {
    renderPage(<ScheduleDetailPageView model={{ ...buildModel({}), error: true, inaccessible: true }} />);

    expect(screen.getByText('볼 수 없는 일정이에요')).toBeInTheDocument();
    expect(screen.queryByText(/잠시 후 다시 시도/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '다시 시도하기' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: '팀 상세로 돌아가기' })).toHaveAttribute('href', '/teams/team-1');
  });

  it('일시적인 조회 실패에는 다시 시도하기를 준다', () => {
    const onRetry = vi.fn();
    renderPage(<ScheduleDetailPageView model={{ ...buildModel({}), error: true, inaccessible: false, onRetry }} />);

    fireEvent.click(screen.getByRole('button', { name: '다시 시도하기' }));

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('볼 수 없는 일정이에요')).not.toBeInTheDocument();
  });
});

describe('일정 상세 — 취소 패널', () => {
  it('일정 취소를 누르면 화면 밖에 펼쳐지는 패널로 스크롤하고 포커스를 옮긴다', () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    const base = buildModel({});
    const closed = { ...base };
    const opened = { ...base, cancelModal: { ...base.cancelModal, open: true } };

    const view = renderPage(<ScheduleDetailPageView model={closed} />);
    expect(scrollIntoView).not.toHaveBeenCalled();

    view.rerender(
      <QueryClientProvider client={new QueryClient()}>
        <ScheduleDetailPageView model={opened} />
      </QueryClientProvider>,
    );

    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('group', { name: '일정을 취소할까요?' })).toHaveFocus();
  });
});

describe('일정 상세 — 용병 모집 열기', () => {
  function withRecruitment(canCreate: boolean) {
    const base = buildModel({});
    return {
      ...base,
      guestRecruitment: {
        ...base.guestRecruitment,
        manage: {
          onCreate: () => undefined,
          onToggleOpen: () => undefined,
          onEdit: () => undefined,
          pending: false,
          exists: false,
          canCreate,
          applications: { items: [], loading: false, error: null, onApprove: () => undefined, onReject: () => undefined, pendingApplicationId: null },
        },
      },
    };
  }

  it('예정된 일정에서만 모집을 열 수 있다', () => {
    renderPage(<ScheduleDetailPageView model={withRecruitment(true)} />);
    expect(screen.getByRole('button', { name: '용병 모집 열기' })).toBeInTheDocument();
  });

  it('취소·종료된 일정에는 모집 열기를 내지 않는다', () => {
    renderPage(<ScheduleDetailPageView model={withRecruitment(false)} />);
    expect(screen.queryByRole('button', { name: '용병 모집 열기' })).not.toBeInTheDocument();
  });
});

// H5 결정 6 — 친선 경기 일정의 응답은 "올 수 있어요? (팀장 참고용)"으로 참석명단과 이름을 나눈다.
describe('일정 상세 — 친선 경기 응답 이름 (H5 A-3)', () => {
  const attendees = {
    visible: true,
    items: [
      { userId: 'u-1', nickname: '선수01', profileImageUrl: null, status: 'GOING' as const },
      { userId: 'u-2', nickname: '선수02', profileImageUrl: null, status: 'NOT_GOING' as const },
      { userId: 'u-3', nickname: '선수03', profileImageUrl: null, status: 'NO_RESPONSE' as const },
    ],
    counts: { all: 3, going: 1, noResponse: 1 },
    canProxy: true,
    viewerUserId: 'u-me',
  };
  const attendance = { visible: true, disabled: false, myStatus: 'GOING' as const, counts: { going: 7, waitlisted: 0 } };

  it('친선 경기면 응답을 "올 수 있어요? (팀장 참고용)"으로 부르고 출전은 참석명단이 정한다고 적는다', () => {
    renderPage(<ScheduleDetailPageView model={buildModel({ visible: false }, attendees, { ...attendance, friendlyMatch: true })} />);

    expect(screen.getByText('올 수 있어요?')).toBeInTheDocument();
    expect(screen.getByText('(팀장 참고용)')).toBeInTheDocument();
    expect(screen.queryByText('내 참석')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '올 수 있어요', pressed: true })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '못 가요', pressed: false })).toBeInTheDocument();
    expect(screen.getByText('이 응답은 출전을 정하지 않아요. 출전 선수는 팀장이 참석명단으로 정해요.')).toBeInTheDocument();
    expect(screen.getByText('올 수 있어요 7명')).toBeInTheDocument();
    expect(screen.getByText('응답 현황')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '올 수 있어요 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '선수03 올 수 있어요로 대신 표시' })).toBeInTheDocument();
    expect(screen.queryByText(/^참석/)).not.toBeInTheDocument();
  });

  it('대조군 — 훈련·모임·대회·리그 일정은 "내 참석 · 참석/미정/불참" 그대로다', () => {
    renderPage(<ScheduleDetailPageView model={buildModel({ visible: false }, attendees, { ...attendance, friendlyMatch: false })} />);

    expect(screen.getByText('내 참석')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '참석', pressed: true })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '불참', pressed: false })).toBeInTheDocument();
    expect(screen.getByText('참석 현황')).toBeInTheDocument();
    expect(screen.queryByText(/올 수 있어요/)).not.toBeInTheDocument();
    expect(screen.queryByText(/출전을 정하지 않아요/)).not.toBeInTheDocument();
  });

  // W2-V3 — 잠긴(취소) 일정은 비활성 배경이 선택 색을 덮어 내 응답이 세 버튼 중 어느 것인지 안 보였다.
  it('잠긴 일정에서도 내 응답은 색이 아니라 체크 표시로 구분된다', () => {
    renderPage(<ScheduleDetailPageView model={buildModel({ visible: false }, {}, { ...attendance, disabled: true, friendlyMatch: false })} />);

    const mine = screen.getByRole('button', { name: '참석', pressed: true });
    expect(mine).toBeDisabled();
    expect(mine.querySelector('svg')).not.toBeNull();
    for (const other of ['미정', '불참']) {
      expect(screen.getByRole('button', { name: other }).querySelector('svg')).toBeNull();
    }
  });
});
