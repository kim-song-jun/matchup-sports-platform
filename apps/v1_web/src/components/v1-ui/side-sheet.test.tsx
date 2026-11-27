import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetNavigationHistoryForTests, installNavigationHistory } from '@/lib/navigation-history';
import { __resetOverlayHistoryForTests } from '@/lib/overlay-history';
import { currentPath, settleHistory } from '@/test/history-router';
import { SIDE_SHEET_DISCARD_CONFIRM, SideSheet } from './side-sheet';

const PAGE = '/admin/tournaments/t-1/info';

beforeEach(() => {
  __resetOverlayHistoryForTests();
  __resetNavigationHistoryForTests();
  window.sessionStorage.clear();
  window.history.replaceState(null, '', '/admin/tournaments/t-1');
  installNavigationHistory();
  window.history.pushState({}, '', PAGE);
});

afterEach(() => {
  __resetOverlayHistoryForTests();
  __resetNavigationHistoryForTests();
});

function Harness({ dirty = false, onClose }: { dirty?: boolean; onClose: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        시트 열기
      </button>
      <SideSheet
        open={open}
        title="대회 정보 수정"
        dirty={dirty}
        footer={<button type="button">저장</button>}
        onClose={() => {
          onClose();
          setOpen(false);
        }}
      >
        <label>
          대회 이름
          <input defaultValue="퀸즈컵" />
        </label>
      </SideSheet>
    </>
  );
}

const sheet = () => screen.getByRole('dialog', { name: '대회 정보 수정' });
const discardDialog = () => screen.getByRole('dialog', { name: SIDE_SHEET_DISCARD_CONFIRM.title });
const openSheet = () => fireEvent.click(screen.getByRole('button', { name: '시트 열기' }));
const back = async () => {
  await act(async () => {
    window.history.back();
    await settleHistory();
  });
};
const settle = () =>
  act(async () => {
    await settleHistory();
  });

describe('SideSheet', () => {
  it('닫혀 있으면 아무것도 그리지 않고, 열리면 제목이 이름인 modal dialog 와 본문·footer 를 그린다', () => {
    render(<Harness onClose={vi.fn()} />);
    expect(screen.queryByRole('dialog')).toBeNull();

    openSheet();

    expect(sheet()).toHaveAttribute('aria-modal', 'true');
    expect(within(sheet()).getByLabelText('대회 이름')).toHaveValue('퀸즈컵');
    expect(within(sheet()).getByRole('button', { name: '저장' })).toBeInTheDocument();
  });

  it('footer 는 스크롤되는 본문 밖에 있다', () => {
    render(<Harness onClose={vi.fn()} />);
    openSheet();

    const body = screen.getByTestId('side-sheet-body');
    expect(within(body).getByLabelText('대회 이름')).toBeInTheDocument();
    expect(within(body).queryByRole('button', { name: '저장' })).toBeNull();
    expect(within(sheet()).getByRole('button', { name: '저장' })).toBeInTheDocument();
  });

  it('dirty 가 아니면 ✕·ESC·바깥 클릭이 곧바로 onClose 를 부른다', async () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);

    openSheet();
    fireEvent.click(within(sheet()).getByRole('button', { name: '닫기' }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('dialog')).toBeNull();

    await settle();
    openSheet();
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(2));

    await settle();
    openSheet();
    fireEvent.click(sheet().parentElement as HTMLElement);
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(3));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('dirty 면 ✕ 가 확인 창을 띄우고, 계속 고치기를 고르면 시트가 남고 onClose 는 불리지 않는다', async () => {
    const onClose = vi.fn();
    render(<Harness dirty onClose={onClose} />);
    openSheet();

    fireEvent.click(within(sheet()).getByRole('button', { name: '닫기' }));
    const confirm = await screen.findByRole('dialog', { name: SIDE_SHEET_DISCARD_CONFIRM.title });
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(within(confirm).getByRole('button', { name: '계속 고치기' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: SIDE_SHEET_DISCARD_CONFIRM.title })).toBeNull());

    expect(onClose).not.toHaveBeenCalled();
    expect(within(sheet()).getByLabelText('대회 이름')).toBeInTheDocument();
  });

  it('dirty 에서 확인 창의 닫기를 고르면 onClose 가 한 번 불린다', async () => {
    const onClose = vi.fn();
    render(<Harness dirty onClose={onClose} />);
    openSheet();

    fireEvent.click(within(sheet()).getByRole('button', { name: '닫기' }));
    const confirm = await screen.findByRole('dialog', { name: SIDE_SHEET_DISCARD_CONFIRM.title });
    fireEvent.click(within(confirm).getByRole('button', { name: '닫기' }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('dirty 시트의 ESC 는 확인 창만 닫고 시트·onClose 는 그대로다', async () => {
    const onClose = vi.fn();
    render(<Harness dirty onClose={onClose} />);
    openSheet();

    fireEvent.keyDown(document, { key: 'Escape' });
    await screen.findByRole('dialog', { name: SIDE_SHEET_DISCARD_CONFIRM.title });
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: SIDE_SHEET_DISCARD_CONFIRM.title })).toBeNull());

    expect(sheet()).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('SIDE_SHEET_DISCARD_CONFIRM 은 title·confirmLabel·cancelLabel 이 정해진 문구다', () => {
    expect(SIDE_SHEET_DISCARD_CONFIRM).toMatchObject({
      title: '저장하지 않고 닫을까요?',
      message: '바꾼 내용이 저장되지 않아요.',
      confirmLabel: '닫기',
      cancelLabel: '계속 고치기',
      tone: 'danger',
    });
  });

  it('dirty 가 아닐 때 뒤로가기는 시트를 닫고 페이지는 그대로다', async () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    openSheet();

    await back();

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(currentPath()).toBe(PAGE);
  });

  it('dirty 일 때 뒤로가기는 확인을 묻고, 계속 고치기면 시트가 남아 다음 뒤로가기도 다시 묻는다', async () => {
    const onClose = vi.fn();
    render(<Harness dirty onClose={onClose} />);
    openSheet();

    await back();
    let confirm = await screen.findByRole('dialog', { name: SIDE_SHEET_DISCARD_CONFIRM.title });
    expect(onClose).not.toHaveBeenCalled();
    expect(currentPath()).toBe(PAGE);

    await act(async () => {
      fireEvent.click(within(confirm).getByRole('button', { name: '계속 고치기' }));
      await settleHistory();
    });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: SIDE_SHEET_DISCARD_CONFIRM.title })).toBeNull());
    expect(sheet()).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(currentPath()).toBe(PAGE);

    await back();
    confirm = await screen.findByRole('dialog', { name: SIDE_SHEET_DISCARD_CONFIRM.title });
    expect(onClose).not.toHaveBeenCalled();
    expect(currentPath()).toBe(PAGE);

    await act(async () => {
      fireEvent.click(within(confirm).getByRole('button', { name: '닫기' }));
      await settleHistory();
    });
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(currentPath()).toBe(PAGE);
  });

  it('열릴 때 포커스가 시트 안으로 가고 닫히면 연 버튼으로 돌아간다', async () => {
    render(<Harness onClose={vi.fn()} />);
    const opener = screen.getByRole('button', { name: '시트 열기' });
    opener.focus();
    openSheet();

    await waitFor(() => expect(sheet().contains(document.activeElement)).toBe(true));

    fireEvent.click(within(sheet()).getByRole('button', { name: '닫기' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.activeElement).toBe(opener);
  });
});
