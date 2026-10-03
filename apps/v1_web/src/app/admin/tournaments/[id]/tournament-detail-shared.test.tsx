import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetNavigationHistoryForTests, installNavigationHistory } from '@/lib/navigation-history';
import { __resetOverlayHistoryForTests } from '@/lib/overlay-history';
import { settleHistory } from '@/test/history-router';
import { SimpleModal } from './tournament-detail-shared';

beforeEach(() => {
  __resetOverlayHistoryForTests();
  __resetNavigationHistoryForTests();
  window.history.replaceState(null, '', '/admin/tournaments/qa/registrations');
  installNavigationHistory();
});

afterEach(() => {
  cleanup();
  __resetOverlayHistoryForTests();
  __resetNavigationHistoryForTests();
});

function ModalHarness({ pending = false, conditional = false }: { pending?: boolean; conditional?: boolean }) {
  const [trigger, setTrigger] = useState<string | null>(null);
  return (
    <>
      <button onClick={() => setTrigger('A')}>명단 검토 A</button>
      <button onClick={() => setTrigger('B')}>명단 검토 B</button>
      <button>경기별 명단</button>
      {(!conditional || trigger !== null) && (
        <SimpleModal open={trigger !== null} title={`명단 검토 ${trigger}`} onClose={() => setTrigger(null)} pending={pending}>
          <label>검토 메모<input disabled={pending} /></label>
          <button disabled={pending} onClick={() => setTrigger(null)}>본문 닫기</button>
        </SimpleModal>
      )}
    </>
  );
}

describe('SimpleModal 초기 focus와 기존 탐색/닫기 계약', () => {
  it.each([false, true])('trigger 클릭 후 첫 Tab의 shift=%s도 내부를 탐색해요', async (shift) => {
    const user = userEvent.setup();
    render(<ModalHarness />);
    await user.click(screen.getByRole('button', { name: '명단 검토 A' }));
    const dialog = screen.getByRole('dialog', { name: '명단 검토 A' });
    expect(within(dialog).getByRole('button', { name: '모달 닫기' })).toHaveFocus();
    await user.tab({ shift });
    expect(shift ? within(dialog).getByRole('button', { name: '본문 닫기' }) : within(dialog).getByRole('textbox')).toHaveFocus();
    for (let i = 0; i < 8; i += 1) {
      await user.tab({ shift });
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
  });

  it.each(['Escape', 'X', '본문', '배경', 'Back'])('%s 닫기는 실제 trigger와 body scroll을 복원해요', async (method) => {
    const user = userEvent.setup();
    const originalOverflow = document.body.style.overflow;
    render(<ModalHarness />);
    const trigger = screen.getByRole('button', { name: '명단 검토 B' });
    await user.click(trigger);
    const dialog = screen.getByRole('dialog');
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(document.body.style.overflow).toBe('hidden');
    if (method === 'Escape') await user.keyboard('{Escape}');
    else if (method === 'X') await user.click(within(dialog).getByRole('button', { name: '모달 닫기' }));
    else if (method === '본문') await user.click(within(dialog).getByRole('button', { name: '본문 닫기' }));
    else if (method === '배경') fireEvent.click(dialog.parentElement!);
    else await act(async () => { window.history.back(); await settleHistory(); });
    await act(async () => { await settleHistory(); });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(document.body.style.overflow).toBe(originalOverflow);
  });

  it('StrictMode 조건부 마운트와 다른 trigger 재개방에서도 복귀 대상을 잃지 않아요', async () => {
    const user = userEvent.setup();
    render(<StrictMode><ModalHarness conditional /></StrictMode>);
    for (const name of ['명단 검토 A', '명단 검토 B', '명단 검토 A']) {
      const trigger = screen.getByRole('button', { name });
      await user.click(trigger);
      expect(within(screen.getByRole('dialog')).getByRole('button', { name: '모달 닫기' })).toHaveFocus();
      await user.keyboard('{Escape}');
      await act(async () => { await settleHistory(); });
      expect(trigger).toHaveFocus();
    }
  });

  it('조회 rerender와 연속 입력은 사용자의 내부 focus를 빼앗지 않아요', async () => {
    const user = userEvent.setup();
    const view = render(<ModalHarness />);
    await user.click(screen.getByRole('button', { name: '명단 검토 A' }));
    await user.tab();
    const input = within(screen.getByRole('dialog')).getByRole('textbox');
    await user.keyboard('검토');
    view.rerender(<ModalHarness />);
    expect(input).toHaveFocus();
    await user.keyboard(' 계속');
    expect(input).toHaveValue('검토 계속');
  });

  it('처음부터 pending으로 잠긴 모달도 panel에 focus를 두고 닫기 잠금을 유지해요', async () => {
    const user = userEvent.setup();
    const view = render(<ModalHarness pending />);
    const trigger = screen.getByRole('button', { name: '명단 검토 A' });
    await user.click(trigger);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveFocus();
    for (const shift of [false, true]) {
      await user.tab({ shift });
      expect(dialog).toHaveFocus();
    }
    await user.keyboard('{Escape}');
    fireEvent.click(dialog.parentElement!);
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: '모달 닫기' })).toBeDisabled();
    view.rerender(<ModalHarness />);
    await user.keyboard('{Escape}');
    await act(async () => { await settleHistory(); });
    expect(trigger).toHaveFocus();
  });
});

describe('SimpleModal 높이 제한', () => {
  it('패널은 뷰포트 높이로 제한되고, 제목 줄은 고정되며 본문만 스크롤돼요', () => {
    render(
      <SimpleModal open title="명단 검토" onClose={vi.fn()}>
        <p>본문</p>
      </SimpleModal>,
    );

    const dialog = screen.getByRole('dialog');
    expect(dialog.className).toContain('max-h-[calc(var(--teameet-visual-viewport-height,100dvh)-2rem)]');
    expect(dialog.className).toContain('flex-col');
    expect(dialog.className).toContain('overflow-hidden');

    const header = screen.getByRole('heading', { name: '명단 검토' }).parentElement!;
    expect(header.className).toContain('shrink-0');

    const body = screen.getByText('본문').parentElement!;
    expect(body.className).toContain('overflow-y-auto');
    expect(body.className).toContain('min-h-0');
  });
});
