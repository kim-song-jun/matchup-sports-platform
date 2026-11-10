import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

import { EventTimeCorrectionSheet, type EventTimeCorrectionSheetProps } from './event-time-correction-sheet';

const MIN = 60_000;

function renderSheet(overrides: Partial<EventTimeCorrectionSheetProps> = {}) {
  const onSubmit = vi.fn().mockResolvedValue(undefined);
  const onClose = vi.fn();
  const onRequestCancelRecord = vi.fn();
  render(
    <EventTimeCorrectionSheet
      open
      mode="operator"
      title="옐로카드 기록 수정"
      summary="2 한달 · 오렌지 FS"
      periodLabel="전반"
      currentClockMs={11 * MIN}
      maxClockMs={22 * MIN + 30_000}
      onSubmit={onSubmit}
      onRequestCancelRecord={onRequestCancelRecord}
      onClose={onClose}
      {...overrides}
    />,
  );
  return { onSubmit, onClose, onRequestCancelRecord };
}

describe('EventTimeCorrectionSheet (MD-QA #187)', () => {
  it('큰 시각과 범위 안내를 보여주고, 바꾸기 전에는 정정 버튼이 비활성이다', () => {
    renderSheet();

    const dialog = screen.getByRole('dialog', { name: '옐로카드 기록 수정' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('button', { name: /정정할 시각 11:00/ })).toBeInTheDocument();
    expect(screen.getByText('전반 0:00–22:30 사이에서 고를 수 있어요. 전·후반은 바꿀 수 없어요.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '시각을 바꾸면 정정할 수 있어요' })).toBeDisabled();
  });

  it('분 ±1, 10초 ±10 버튼으로 맞추고 "11:00 → 9:00으로 정정"을 보낸다', async () => {
    const user = userEvent.setup();
    const { onSubmit, onClose } = renderSheet();

    await user.click(screen.getByRole('button', { name: '1분 빼기' }));
    await user.click(screen.getByRole('button', { name: '1분 빼기' }));
    expect(screen.getByRole('button', { name: /정정할 시각 9:00/ })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '10초 더하기' }));
    await user.click(screen.getByRole('button', { name: '10초 빼기' }));

    await user.click(screen.getByRole('button', { name: '11:00 → 9:00으로 정정' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({
      clockMs: 9 * MIN,
      reason: '경기 중 기록 시각 정정 (11:00 → 9:00)',
    });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('받침에 맞춰 "로/으로"를 고른다', async () => {
    const user = userEvent.setup();
    renderSheet();

    await user.click(screen.getByRole('button', { name: '1분 빼기' }));
    expect(screen.getByRole('button', { name: '11:00 → 10:00으로 정정' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: '10초 더하기' }));
    expect(screen.getByRole('button', { name: '11:00 → 10:10으로 정정' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: '10초 더하기' }));
    await user.click(screen.getByRole('button', { name: '10초 더하기' }));
    expect(screen.getByRole('button', { name: '11:00 → 10:30으로 정정' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: '10초 더하기' }));
    expect(screen.getByRole('button', { name: '11:00 → 10:40으로 정정' })).toBeEnabled();
  });

  it('시각을 탭해 숫자로 직접 입력할 수 있다 (inputmode=numeric, Enter 로 확정)', async () => {
    const user = userEvent.setup();
    renderSheet();

    await user.click(screen.getByRole('button', { name: /정정할 시각 11:00/ }));
    const input = screen.getByRole('textbox', { name: /숫자로 입력/ });
    expect(input).toHaveAttribute('inputmode', 'numeric');
    await user.type(input, '930{Enter}');

    expect(screen.getByRole('button', { name: /정정할 시각 9:30/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '11:00 → 9:30으로 정정' })).toBeEnabled();
  });

  it('초가 59를 넘는 숫자는 받지 않고 이유를 말한다', async () => {
    const user = userEvent.setup();
    renderSheet();

    await user.click(screen.getByRole('button', { name: /정정할 시각 11:00/ }));
    const input = screen.getByRole('textbox', { name: /숫자로 입력/ });
    await user.type(input, '975{Enter}');

    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('초는 59까지만 쓸 수 있어요.')).toBeInTheDocument();
  });

  it('범위 밖이면 안내가 오류 문장으로 바뀌고 정정 버튼이 막힌다', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderSheet();

    await user.click(screen.getByRole('button', { name: /정정할 시각 11:00/ }));
    await user.type(screen.getByRole('textbox', { name: /숫자로 입력/ }), '2300{Enter}');

    expect(screen.getByText('전반 0:00–22:30 밖이에요. 범위 안으로 맞춰 주세요.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '11:00 → 23:00으로 정정' })).toBeDisabled();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('± 버튼은 범위 끝에서 더 나가지 않는다', async () => {
    const user = userEvent.setup();
    renderSheet({ currentClockMs: 20_000, maxClockMs: 40_000 });

    await user.click(screen.getByRole('button', { name: '10초 빼기' }));
    await user.click(screen.getByRole('button', { name: '10초 빼기' }));
    expect(screen.getByRole('button', { name: '10초 빼기' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /정정할 시각 0:00/ })).toBeInTheDocument();

    for (let i = 0; i < 4; i += 1) await user.click(screen.getByRole('button', { name: '10초 더하기' }));
    expect(screen.getByRole('button', { name: '10초 더하기' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /정정할 시각 0:40/ })).toBeInTheDocument();
  });

  it('저장이 실패하면 서버 코드를 해요체로 풀어 보여주고 시트를 열어 둔다', async () => {
    const user = userEvent.setup();
    const onSubmit = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error('x'), { code: 'EVENT_ALREADY_REVERSED' }));
    const { onClose } = renderSheet({ onSubmit });

    await user.click(screen.getByRole('button', { name: '1분 빼기' }));
    await user.click(screen.getByRole('button', { name: '11:00 → 10:00으로 정정' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('이미 취소된 기록은 시각을 고칠 수 없어요.');
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '11:00 → 10:00으로 정정' })).toBeEnabled();
  });

  it('"기록 취소" 탭에서 기존 취소 흐름으로 넘긴다', async () => {
    const user = userEvent.setup();
    const { onRequestCancelRecord } = renderSheet();

    expect(screen.getByRole('tab', { name: '시간 정정' })).toHaveAttribute('aria-selected', 'true');
    await user.click(screen.getByRole('tab', { name: '기록 취소' }));
    expect(screen.getByRole('tab', { name: '기록 취소' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByRole('button', { name: /으로 정정$/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '이 기록 취소하기' }));
    expect(onRequestCancelRecord).toHaveBeenCalledTimes(1);
  });

  it('탭은 화살표 키로 옮긴다', async () => {
    const user = userEvent.setup();
    renderSheet();

    screen.getByRole('tab', { name: '시간 정정' }).focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: '기록 취소' })).toHaveAttribute('aria-selected', 'true');
  });

  it('ESC 로 닫는다', async () => {
    const user = userEvent.setup();
    const { onClose } = renderSheet();

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });

  it('어드민 모드: 확정된 결과 표시, 사유 필수, 탭 없음', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderSheet({ mode: 'admin', onRequestCancelRecord: undefined, maxClockMs: null });

    expect(screen.getByText('확정된 결과')).toBeInTheDocument();
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    expect(screen.getByText('전반 0:00부터 고를 수 있어요. 전·후반은 바꿀 수 없어요.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '1분 빼기' }));
    await user.click(screen.getByRole('button', { name: '1분 빼기' }));
    expect(screen.getByRole('button', { name: '11:00 → 9:00으로 정정' })).toBeDisabled();

    await user.type(screen.getByLabelText(/정정 사유/), '  심판 기록지 대조 결과 9분 경고  ');
    await user.click(screen.getByRole('button', { name: '11:00 → 9:00으로 정정' }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({ clockMs: 9 * MIN, reason: '심판 기록지 대조 결과 9분 경고' }),
    );
  });

  it('어드민 모드: 공백뿐인 사유는 사유 없음과 같다', async () => {
    const user = userEvent.setup();
    renderSheet({ mode: 'admin', onRequestCancelRecord: undefined });

    await user.click(screen.getByRole('button', { name: '1분 빼기' }));
    await user.type(screen.getByLabelText(/정정 사유/), '   ');
    expect(screen.getByRole('button', { name: '11:00 → 10:00으로 정정' })).toBeDisabled();
  });

  it('모든 조작 버튼은 44px 터치 타깃 클래스를 가진다', () => {
    renderSheet();
    for (const name of ['1분 빼기', '1분 더하기', '10초 빼기', '10초 더하기']) {
      expect(screen.getByRole('button', { name }).className).toContain('h-11 w-11');
    }
    expect(screen.getByRole('tab', { name: '시간 정정' }).className).toContain('min-h-[44px]');
  });
});
