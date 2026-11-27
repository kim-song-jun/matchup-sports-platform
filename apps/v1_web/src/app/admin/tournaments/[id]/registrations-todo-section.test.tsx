import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useV1ExportRosterCsv } from '@/hooks/use-v1-api';
import { __resetOverlayHistoryForTests } from '@/lib/overlay-history';
import { handlersFixture, registrationFixture as reg, viewContextFixture } from '@/test/registration-fixtures';
import { installViewport } from '@/test/viewport';
import type { V1AdminTournamentRegistration } from '@/types/api';
import { RegistrationsTodoSection } from './registrations-todo-section';

vi.mock('@/hooks/use-v1-api', () => ({ useV1ExportRosterCsv: vi.fn() }));
vi.mock('next/navigation', () => ({ usePathname: () => '/admin/tournaments/t-1' }));

let restoreViewport: () => void;

beforeEach(() => {
  restoreViewport = installViewport(1280);
  vi.mocked(useV1ExportRosterCsv).mockReturnValue({ mutate: vi.fn(), isPending: false } as never);
});

afterEach(() => {
  cleanup();
  restoreViewport();
  __resetOverlayHistoryForTests();
  vi.clearAllMocks();
});

function renderSection(
  rows: V1AdminTournamentRegistration[],
  options: { ctx?: Parameters<typeof viewContextFixture>[0]; selectedIds?: string[] } = {},
) {
  const handlers = handlersFixture();
  const onToggleSelected = vi.fn();
  const onClearSelected = vi.fn();
  const onBatchConfirm = vi.fn();
  render(
    <RegistrationsTodoSection
      rows={rows}
      ctx={viewContextFixture(options.ctx)}
      handlers={handlers}
      selectedIds={new Set(options.selectedIds ?? [])}
      onToggleSelected={onToggleSelected}
      onClearSelected={onClearSelected}
      onBatchConfirm={onBatchConfirm}
    />,
  );
  return { handlers, onToggleSelected, onClearSelected, onBatchConfirm };
}

const rowOf = (teamName: string) => screen.getByText(teamName).closest('li') as HTMLElement;
const buttonNames = (row: HTMLElement) => within(row).getAllByRole('button').map((button) => button.getAttribute('aria-label') ?? button.textContent);

const awaiting = (overrides: Partial<V1AdminTournamentRegistration> = {}) =>
  reg({ id: 'a', teamName: '성수', status: 'awaiting_payment', playerCount: 7, ...overrides });
const checking = (overrides: Partial<V1AdminTournamentRegistration> = {}) =>
  reg({ id: 'c', teamName: '마포', status: 'payment_checking', ...overrides });
const cancelRequested = (overrides: Partial<V1AdminTournamentRegistration> = {}) =>
  reg({ id: 'r', teamName: '분당', status: 'cancel_requested', cancelRequestedAt: '2026-11-27T04:00:00.000Z', ...overrides });

describe('RegistrationsTodoSection — 행의 다음 할 일', () => {
  it('입금 대기 행에는 입금 확인 하나와 ⋯ 만 있고, 누르면 그 신청으로 부른다', () => {
    const { handlers } = renderSection([awaiting()]);
    expect(buttonNames(rowOf('성수'))).toEqual(['입금 확인', '성수 더보기']);
    fireEvent.click(within(rowOf('성수')).getByRole('button', { name: '입금 확인' }));
    expect(handlers.onConfirmPayment).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }));
  });

  it('무료 대회는 같은 자리가 「신청 확인」이고 행 어디에도 입금 말이 없다', () => {
    renderSection([awaiting()], { ctx: { isFreeEntry: true } });
    const row = rowOf('성수');
    expect(buttonNames(row)).toEqual(['신청 확인', '성수 더보기']);
    expect(row).toHaveTextContent('신청 작성 중');
    expect(row.textContent).not.toContain('입금');
  });

  it('유료 대회 행 어디에도 「신청 확인」이 없다', () => {
    renderSection([awaiting(), checking(), reg({ id: 'p', teamName: '서초', status: 'paid' })]);
    expect(document.body.textContent).not.toContain('신청 확인');
  });

  it.each(['payment_checking', 'paid'] as const)('%s 행의 주 버튼은 「확정」이고 대회가 닫히면 비활성이다', (status) => {
    const { handlers } = renderSection([checking({ status })]);
    fireEvent.click(within(rowOf('마포')).getByRole('button', { name: '확정' }));
    expect(handlers.onConfirm).toHaveBeenCalledWith(expect.objectContaining({ id: 'c' }));
    cleanup();

    const blocked = renderSection([checking({ status })], { ctx: { admissionsBlockedReason: '종료된 대회예요.' } });
    const confirm = within(rowOf('마포')).getByRole('button', { name: '확정' });
    expect(confirm).toBeDisabled();
    fireEvent.click(confirm);
    expect(blocked.handlers.onConfirm).not.toHaveBeenCalled();
  });

  it('행 설명과 메타 한 줄이 상태·인원·신청 시각을 말하고, 금액이 있을 때만 결제 요약이 붙는다', () => {
    renderSection([
      awaiting({ depositorName: '김성수', payment: { method: 'bank_transfer', status: 'ready', amount: 70000 } as never }),
      checking({ playerCount: 0, payment: { method: 'bank_transfer', status: 'paid', amount: 0 } as never }),
    ]);
    const first = rowOf('성수');
    expect(first).toHaveTextContent('입금 내용을 보고 확인해 주세요');
    expect(first).toHaveTextContent('명단 7명');
    expect(first).toHaveTextContent('입금자 김성수');
    expect(first).toHaveTextContent('70,000');
    const second = rowOf('마포');
    expect(second).toHaveTextContent('명단 미등록');
    expect(second).not.toHaveTextContent('무료 참가');
  });
});

describe('RegistrationsTodoSection — 취소 처리', () => {
  it('취소 요청은 「취소 처리」를 눌러야 승인·유지가 펼쳐지고 각각 자기 핸들러를 부른다', () => {
    const { handlers } = renderSection([cancelRequested({ cancelReason: '선수 부족', adminCancelReason: '안내함' })]);
    const row = rowOf('분당');
    expect(row).toHaveTextContent('팀이 참가 취소를 요청했어요');
    expect(row).toHaveTextContent('팀 취소 사유: 선수 부족');
    expect(row).toHaveTextContent('운영진 사유: 안내함');

    const toggle = within(row).getByRole('button', { name: '취소 처리' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(within(row).queryByRole('button', { name: '취소 승인' })).toBeNull();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(toggle).toHaveAttribute('aria-controls', within(row).getByRole('button', { name: '취소 승인' }).closest('[id]')!.id);
    fireEvent.click(within(row).getByRole('button', { name: '취소 승인' }));
    expect(handlers.onApproveCancel).toHaveBeenCalledWith(expect.objectContaining({ id: 'r' }));

    fireEvent.click(within(row).getByRole('button', { name: '취소 처리' }));
    fireEvent.click(within(row).getByRole('button', { name: '참가 유지' }));
    expect(handlers.onKeepRegistration).toHaveBeenCalledWith(expect.objectContaining({ id: 'r' }));
  });

  it('폰에서는 같은 버튼이 시트만 열고 인라인 선택을 펼치지 않는다', () => {
    restoreViewport();
    restoreViewport = installViewport(390);
    const { handlers } = renderSection([cancelRequested()]);
    fireEvent.click(within(rowOf('분당')).getByRole('button', { name: '취소 처리' }));
    expect(handlers.onOpenCancelSheet).toHaveBeenCalledWith(expect.objectContaining({ id: 'r' }));
    expect(screen.queryByRole('button', { name: '취소 승인' })).toBeNull();
  });
});

describe('RegistrationsTodoSection — 조회 전용', () => {
  it('모든 행의 주 버튼이 「명단 보기」이고 변경 조작도 고르기도 없다', () => {
    const { handlers } = renderSection([awaiting(), checking(), cancelRequested()], { ctx: { canWrite: false } });
    for (const team of ['성수', '마포', '분당']) {
      expect(within(rowOf(team)).getByRole('button', { name: '명단 보기' })).toBeInTheDocument();
    }
    expect(screen.queryByRole('checkbox')).toBeNull();
    for (const name of ['골라서 처리', '확정', '입금 확인', '취소 처리']) {
      expect(screen.queryByRole('button', { name })).toBeNull();
    }
    fireEvent.click(within(rowOf('마포')).getByRole('button', { name: '명단 보기' }));
    expect(handlers.onViewRoster).toHaveBeenCalledWith(expect.objectContaining({ id: 'c' }));
  });
});

describe('RegistrationsTodoSection — 일괄 선택(데스크톱)', () => {
  it('체크박스는 입금 대기 행에만 있고, 누르면 그 id 로 부른다', () => {
    const { onToggleSelected } = renderSection([awaiting(), checking(), cancelRequested()]);
    const boxes = screen.getAllByRole('checkbox');
    expect(boxes).toHaveLength(1);
    expect(boxes[0]).toHaveAccessibleName('성수 일괄 선택');
    fireEvent.click(boxes[0]);
    expect(onToggleSelected).toHaveBeenCalledWith('a');
  });

  it('선택하면 막대가 팀 수와 처리 문구를 말하고, 처리·해제를 부른다', () => {
    const { onBatchConfirm, onClearSelected } = renderSection([awaiting(), awaiting({ id: 'b', teamName: '송파' })], {
      selectedIds: ['a'],
    });
    const bar = screen.getByRole('region', { name: '선택한 신청 한꺼번에 처리' });
    expect(bar).toHaveTextContent('1팀 선택했어요');
    expect(screen.getByRole('checkbox', { name: '성수 일괄 선택' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: '송파 일괄 선택' })).not.toBeChecked();

    fireEvent.click(within(bar).getByRole('button', { name: '선택한 1팀 입금 확인' }));
    expect(onBatchConfirm).toHaveBeenCalledTimes(1);
    fireEvent.click(within(bar).getByRole('button', { name: '선택 해제' }));
    expect(onClearSelected).toHaveBeenCalledTimes(1);
  });

  it('무료 대회의 막대 문구는 「신청 확인」이다', () => {
    renderSection([awaiting()], { ctx: { isFreeEntry: true }, selectedIds: ['a'] });
    expect(screen.getByRole('button', { name: '선택한 1팀 신청 확인' })).toBeInTheDocument();
  });

  it('새로고침으로 더는 고를 수 없게 된 행의 선택은 팀 수에도 막대에도 들어가지 않는다', () => {
    renderSection([awaiting(), checking()], { selectedIds: ['c'] });
    expect(screen.queryByRole('region', { name: '선택한 신청 한꺼번에 처리' })).toBeNull();
    cleanup();

    renderSection([awaiting(), checking()], { selectedIds: ['a', 'c', 'gone'] });
    expect(screen.getByRole('region', { name: '선택한 신청 한꺼번에 처리' })).toHaveTextContent('1팀 선택했어요');
    expect(screen.getByRole('button', { name: '선택한 1팀 입금 확인' })).toBeInTheDocument();
  });

  it('처리 중에는 막대의 처리 버튼이 잠긴다', () => {
    renderSection([awaiting()], { ctx: { busy: true }, selectedIds: ['a'] });
    expect(screen.getByRole('button', { name: '선택한 1팀 입금 확인' })).toBeDisabled();
  });
});

describe('RegistrationsTodoSection — 머리와 빈 상태', () => {
  it('머리에 건수를 말하고 행 수와 같다', () => {
    renderSection([awaiting(), checking(), cancelRequested()]);
    expect(screen.getByRole('heading', { name: /처리할 것/ })).toHaveTextContent('3건');
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
  });

  it('0건이면 머리는 그대로 두고 끝났다는 한 줄을 보인다', () => {
    renderSection([]);
    expect(screen.getByRole('heading', { name: /처리할 것/ })).toHaveTextContent('0건');
    expect(screen.getByText('지금 처리할 신청이 없어요')).toBeInTheDocument();
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
  });
});

describe('RegistrationsTodoSection — 골라서 처리(폰)', () => {
  beforeEach(() => {
    restoreViewport();
    restoreViewport = installViewport(390);
  });

  it('처음에는 체크박스도 막대도 없고, 고르기 모드가 선택 가능한 행만 체크할 수 있게 바꾼다', () => {
    const { onClearSelected } = renderSection([awaiting(), cancelRequested()]);
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByRole('region', { name: '선택한 신청 한꺼번에 처리' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '골라서 처리' }));
    const boxes = screen.getAllByRole('checkbox');
    expect(boxes).toHaveLength(1);
    expect(boxes[0]).toHaveAccessibleName('성수 일괄 선택');
    expect(screen.getByText(/체크할 수 있는 팀만 한꺼번에 처리해요/)).toHaveTextContent('0팀 선택했어요');
    expect(screen.queryByRole('button', { name: '입금 확인' })).toBeNull();
    expect(screen.queryByRole('button', { name: '성수 더보기' })).toBeNull();
    expect(rowOf('분당')).toHaveTextContent('한꺼번에 처리할 수 없어요. 고르기를 끝내고 따로 처리해요.');
    expect(within(rowOf('분당')).queryByRole('button')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '그만 고르기' }));
    expect(onClearSelected).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.getByRole('button', { name: '골라서 처리' })).toBeInTheDocument();
    expect(within(rowOf('성수')).getByRole('button', { name: '입금 확인' })).toBeInTheDocument();
  });

  it('고른 팀이 있으면 화면 아래 막대에서 한꺼번에 처리한다', () => {
    const { onBatchConfirm, onToggleSelected } = renderSection([awaiting()], { selectedIds: ['a'] });
    fireEvent.click(screen.getByRole('button', { name: '골라서 처리' }));
    fireEvent.click(screen.getByRole('checkbox', { name: '성수 일괄 선택' }));
    expect(onToggleSelected).toHaveBeenCalledWith('a');

    const bar = screen.getByRole('region', { name: '선택한 신청 한꺼번에 처리' });
    expect(screen.getByText(/체크할 수 있는 팀만/)).toHaveTextContent('1팀 선택했어요');
    fireEvent.click(within(bar).getByRole('button', { name: '선택한 1팀 입금 확인' }));
    expect(onBatchConfirm).toHaveBeenCalledTimes(1);
  });

  it('고를 수 있는 행이 없거나 조회 전용이면 「골라서 처리」가 없다', () => {
    renderSection([checking(), cancelRequested()]);
    expect(screen.queryByRole('button', { name: '골라서 처리' })).toBeNull();
    cleanup();

    renderSection([awaiting()], { ctx: { canWrite: false } });
    expect(screen.queryByRole('button', { name: '골라서 처리' })).toBeNull();
  });

  it('폰의 행은 설명 아래 주 버튼이 있고 ⋯ 는 이름 줄에 있다', () => {
    renderSection([awaiting()]);
    expect(buttonNames(rowOf('성수'))).toEqual(['성수 더보기', '입금 확인']);
  });
});
