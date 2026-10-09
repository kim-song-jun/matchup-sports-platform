import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { directPlacedRegistrationIds } from '@/lib/bracket-canvas-layout';
import { makeFixture, makeRegistration, makeSlot } from '@/test/bracket-canvas-fixtures';
import type { V1AdminBracketFixture } from '@/types/api';
import { BracketTeamTray } from './bracket-team-tray';
import { REGISTRATION_DRAG_MIME } from './bracket-canvas-dnd';

const registrations = [
  makeRegistration({ id: 'r1', teamName: '서울FC' }),
  makeRegistration({ id: 'r2', teamName: '부산FC' }),
  makeRegistration({ id: 'r3', teamName: '대구FC' }),
  makeRegistration({ id: 'r4', teamName: '입금 대기 팀', status: 'awaiting_payment' }),
];

const loaded = { status: 'success', truncated: false, refetchFailed: false, error: null, onRetry: vi.fn() } as const;

// 화면과 같은 경로로 직접 지정 팀을 계산해 넘긴다(워크스페이스가 하는 일).
function renderTray({
  fixtures = [],
  ...overrides
}: Partial<React.ComponentProps<typeof BracketTeamTray>> & { fixtures?: V1AdminBracketFixture[] } = {}) {
  const slots = overrides.slots ?? [];
  const props = {
    registrations,
    registrationsState: loaded,
    pendingRegistrationId: null,
    canWrite: true,
    onPick: vi.fn(),
    ...overrides,
    slots,
    directPlacedIds: directPlacedRegistrationIds(fixtures, slots),
  };
  render(<BracketTeamTray {...props} />);
  return props;
}

describe('BracketTeamTray', () => {
  it('확정된 팀만 이름순으로 나열하고 미배정 수를 보여 준다', () => {
    renderTray();
    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual(['대구FC', '부산FC', '서울FC']);
    expect(screen.queryByText('입금 대기 팀')).not.toBeInTheDocument();
    expect(screen.getByText('미배정 3 / 전체 3')).toBeInTheDocument();
  });

  it('ENTRY·BYE 자리에 들어간 팀은 비활성이고 "배정됨"으로 표시한다(순위 자리는 배정으로 세지 않는다)', () => {
    renderTray({
      slots: [
        makeSlot({ id: 's1', kind: 'ENTRY', registrationId: 'r1' }),
        makeSlot({ id: 's2', kind: 'BYE', registrationId: 'r2' }),
        makeSlot({ id: 's3', kind: 'GROUP_RANK', registrationId: 'r3' }),
      ],
    });
    expect(screen.getByRole('button', { name: /서울FC/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /부산FC/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /대구FC/ })).toBeEnabled();
    expect(screen.getAllByText('배정됨')).toHaveLength(2);
    expect(screen.getByText('미배정 1 / 전체 3')).toBeInTheDocument();
  });

  it('팀을 누르면 그 팀을 선택한다', () => {
    const props = renderTray();
    fireEvent.click(screen.getByRole('button', { name: /서울FC/ }));
    expect(props.onPick).toHaveBeenCalledWith('r1');
  });

  it('선택된 팀은 aria-pressed 와 "선택됨" 글자로 알리고, 다시 누르면 null 을 보낸다', () => {
    const props = renderTray({ pendingRegistrationId: 'r1' });
    const selected = screen.getByRole('button', { name: /서울FC/ });
    expect(selected).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('선택됨')).toBeInTheDocument();
    fireEvent.click(selected);
    expect(props.onPick).toHaveBeenCalledWith(null);
  });

  it('끌기를 시작하면 registrationId 를 전달 데이터에 심는다', () => {
    renderTray();
    const setData = vi.fn();
    fireEvent.dragStart(screen.getByRole('button', { name: /서울FC/ }), { dataTransfer: { setData, effectAllowed: '' } });
    expect(setData).toHaveBeenCalledWith(REGISTRATION_DRAG_MIME, 'r1');
  });

  it('읽기 전용이면 모든 팀이 비활성이고 안내만 보인다', () => {
    renderTray({ canWrite: false });
    screen.getAllByRole('button').forEach((button) => expect(button).toBeDisabled());
    expect(screen.getByText('읽기 전용이라 팀을 넣을 수 없어요.')).toBeInTheDocument();
  });

  it('확정된 팀이 없으면 빈 안내를 보여 준다', () => {
    renderTray({ registrations: [registrations[3]] });
    expect(screen.getByText('확정된 참가팀이 아직 없어요.')).toBeInTheDocument();
  });

  describe('신청 목록 조회 상태', () => {
    it('불러오는 중에는 "참가팀 없음"이 아니라 로딩 안내를 보이고 개수는 숨긴다', () => {
      renderTray({ registrations: [], registrationsState: { ...loaded, status: 'pending' } });
      expect(screen.getByText('참가팀을 불러오는 중이에요.')).toBeInTheDocument();
      expect(screen.queryByText('확정된 참가팀이 아직 없어요.')).not.toBeInTheDocument();
      expect(screen.queryByText(/미배정/)).not.toBeInTheDocument();
    });

    it('실패하면 이유와 "다시 시도"를 보이고 누르면 재조회한다', () => {
      const onRetry = vi.fn();
      renderTray({ registrations: [], registrationsState: { ...loaded, status: 'error', error: null, onRetry } });
      expect(screen.getByRole('alert')).toHaveTextContent('참가팀을 불러오지 못했어요.');
      expect(screen.queryByText('확정된 참가팀이 아직 없어요.')).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
      expect(onRetry).toHaveBeenCalledTimes(1);
    });

    it('잘렸으면 목록은 그대로 두고 일부만 불러왔다고 알린다', () => {
      renderTray({ registrationsState: { ...loaded, truncated: true } });
      expect(screen.getByText('참가팀이 많아 일부만 불러왔어요.')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /서울FC/ })).toBeEnabled();
    });

    it('정상이면 잘림 안내가 없다', () => {
      renderTray();
      expect(screen.queryByText('참가팀이 많아 일부만 불러왔어요.')).not.toBeInTheDocument();
    });
  });

  describe('자리 없는 옛 대진', () => {
    const legacy = [
      makeFixture({ id: 'f1', groupId: 'g', fixtureNumber: 1, homeRegistrationId: 'r1', awayRegistrationId: 'r2' }),
      makeFixture({ id: 'f2', groupId: 'g', fixtureNumber: 2, homeRegistrationId: 'r1', awayRegistrationId: 'r3', status: 'cancelled' }),
    ];

    it('경기에 직접 들어간 팀은 "경기에 있음"으로 표시하되 비활성이 아니고, 취소된 경기의 팀은 세지 않는다', () => {
      renderTray({ fixtures: legacy });
      expect(screen.getAllByText('경기에 있음')).toHaveLength(2);
      expect(screen.getByRole('button', { name: /서울FC/ })).toBeEnabled();
      expect(screen.getByRole('button', { name: /서울FC/ })).toHaveAttribute('draggable', 'true');
      // 대구FC 는 취소된 경기에만 있어 미배정 그대로다.
      expect(screen.getByRole('button', { name: /대구FC/ })).not.toHaveTextContent('경기에 있음');
      expect(screen.getByText('미배정 1 / 전체 3')).toBeInTheDocument();
    });

    it('이전 경기 연결로 채워진 줄에 박힌 팀은 직접 지정이 아니라서 세지 않는다', () => {
      const fed = makeFixture({
        id: 'f3',
        groupId: 'g',
        fixtureNumber: 3,
        homeRegistrationId: 'r1',
        bracketSources: [{ fixtureId: 'f1', outcome: 'WINNER', side: 'HOME' }],
      });
      renderTray({ fixtures: [fed] });
      expect(screen.queryByText('경기에 있음')).not.toBeInTheDocument();
      expect(screen.getByText('미배정 3 / 전체 3')).toBeInTheDocument();
    });

    it('자리에 들어간 팀은 여전히 비활성 "배정됨"이다', () => {
      renderTray({ fixtures: legacy, slots: [makeSlot({ id: 's1', kind: 'ENTRY', registrationId: 'r3' })] });
      expect(screen.getByRole('button', { name: /대구FC/ })).toBeDisabled();
      expect(screen.getByText('배정됨')).toBeInTheDocument();
      expect(screen.getByText('미배정 0 / 전체 3')).toBeInTheDocument();
    });
  });
});
