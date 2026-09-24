/**
 * 오버레이 뒤로가기 닫기 — useModalA11y(공유 프리미티브)와 useConfirm 을 통해 검증한다.
 * 이 테스트가 잡는 버그: 뒤로가기가 모달을 건너뛰고 화면을 떠나는 것, 겹친 모달이 한 번에 다 닫히는 것,
 * ✕ 로 닫은 뒤 남은 항목 때문에 다음 뒤로가기가 헛도는 것, 닫기 back 이 페이지 전환·Next 로 새는 것.
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __resetNavigationHistoryForTests,
  installNavigationHistory,
  subscribeAppPop,
} from '@/lib/navigation-history';
import { __resetOverlayHistoryForTests, overlayMarkerOf } from '@/lib/overlay-history';
import { currentPath, settleHistory } from '@/test/history-router';
import { useConfirm } from './confirm-modal';
import { useModalA11y } from './use-modal-a11y';

// Next 라우터는 추적기보다 뒤에 popstate 를 듣는다 — 그 자리를 흉내 내 무엇이 새는지 본다.
const nextRouterPop = vi.fn();
const appPop = vi.fn();

beforeEach(() => {
  __resetOverlayHistoryForTests();
  __resetNavigationHistoryForTests();
  window.sessionStorage.clear();
  window.history.replaceState(null, '', '/home');
  installNavigationHistory();
  window.history.pushState({}, '', '/teams/1');
  window.addEventListener('popstate', nextRouterPop);
  subscribeAppPop(appPop);
});
afterEach(() => {
  window.removeEventListener('popstate', nextRouterPop);
  __resetOverlayHistoryForTests();
  __resetNavigationHistoryForTests();
  vi.clearAllMocks();
});

function Modal({ name, open, onClose }: { name: string; open: boolean; onClose: () => void }) {
  const { dialogRef } = useModalA11y({ open, onClose });
  return open ? <div ref={dialogRef} role="dialog" aria-label={name} /> : null;
}

function TwoModals() {
  const [a, setA] = useState(false);
  const [b, setB] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setA(true)}>A 열기</button>
      <button type="button" onClick={() => setB(true)}>B 열기</button>
      <button type="button" onClick={() => setA(false)}>A 닫기</button>
      <Modal name="A" open={a} onClose={() => setA(false)} />
      <Modal name="B" open={b} onClose={() => setB(false)} />
    </>
  );
}

const back = async () => {
  await act(async () => {
    window.history.back();
    await settleHistory();
  });
};
const dialogs = () => screen.queryAllByRole('dialog').map((el) => el.getAttribute('aria-label'));

describe('오버레이 — 뒤로가기로 닫기', () => {
  it('열린 모달은 뒤로가기에 닫히고 화면은 그대로다(페이지 이동·Next 로 전달 없음)', async () => {
    render(<TwoModals />);
    fireEvent.click(screen.getByRole('button', { name: 'A 열기' }));
    expect(overlayMarkerOf(window.history.state)).not.toBeNull();

    await back();

    expect(dialogs()).toEqual([]);
    expect(currentPath()).toBe('/teams/1');
    expect(appPop).not.toHaveBeenCalled();
    expect(nextRouterPop).not.toHaveBeenCalled();
  });

  it('겹친 모달은 위에서부터 하나씩 닫힌다', async () => {
    render(<TwoModals />);
    fireEvent.click(screen.getByRole('button', { name: 'A 열기' }));
    fireEvent.click(screen.getByRole('button', { name: 'B 열기' }));
    expect(dialogs()).toEqual(['A', 'B']);

    await back();
    expect(dialogs()).toEqual(['A']);
    await back();
    expect(dialogs()).toEqual([]);
    expect(currentPath()).toBe('/teams/1');
    expect(appPop).not.toHaveBeenCalled();
  });

  it('✕ 등으로 닫으면 자기 항목을 back 한 번으로 걷는다 — 전환·Next 로 새지 않고, 다음 뒤로가기는 화면을 떠난다', async () => {
    const historyBack = vi.spyOn(window.history, 'back');
    render(<TwoModals />);
    fireEvent.click(screen.getByRole('button', { name: 'A 열기' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'A 닫기' }));
      await settleHistory();
    });

    expect(historyBack).toHaveBeenCalledTimes(1);
    expect(overlayMarkerOf(window.history.state)).toBeNull();
    expect(appPop).not.toHaveBeenCalled();
    expect(nextRouterPop).not.toHaveBeenCalled();

    await back();
    expect(currentPath()).toBe('/home');
    expect(appPop).toHaveBeenCalledTimes(1);
  });

  it('닫기 back 이 예약된 사이 새 페이지로 push 되면(back 취소) 새 페이지에 머물고, 이후 뒤로가기는 한 번에 이전 화면으로 간다', async () => {
    render(<TwoModals />);
    fireEvent.click(screen.getByRole('button', { name: 'A 열기' }));
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'A 닫기' })); // 닫기 back 이 예약된다
    });
    window.history.pushState({}, '', '/teams/2'); // 모달 안 링크의 이동이 그 back 보다 먼저 커밋된 경우
    await act(async () => {
      await settleHistory();
    });
    expect(currentPath()).toBe('/teams/2');

    // 사용자가 새 페이지를 보고 나서 누른 뒤로가기 — 닫힌 모달의 남은 표식에 멈추지 않는다.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 150));
    });
    await back();
    expect(currentPath()).toBe('/teams/1');
    expect(overlayMarkerOf(window.history.state)).toBeNull();
    await back();
    expect(currentPath()).toBe('/home');
  });
});

function ConfirmHarness({ onResult }: { onResult: (value: boolean) => void }) {
  const { confirm, ConfirmModal } = useConfirm();
  return (
    <>
      <button type="button" onClick={() => void confirm({ title: '삭제할까요?', message: '되돌릴 수 없어요.' }).then(onResult)}>
        삭제
      </button>
      {ConfirmModal}
    </>
  );
}

describe('ConfirmModal — 뒤로가기', () => {
  it('뒤로가기는 취소로 닫고 화면은 떠나지 않는다', async () => {
    const onResult = vi.fn();
    render(<ConfirmHarness onResult={onResult} />);
    fireEvent.click(screen.getByRole('button', { name: '삭제' }));
    expect(screen.getByRole('dialog')).toBeTruthy();

    await back();

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(onResult).toHaveBeenCalledWith(false);
    expect(currentPath()).toBe('/teams/1');
    expect(nextRouterPop).not.toHaveBeenCalled();
  });

  it('확인으로 닫으면 항목을 걷은 뒤에 결과를 알린다', async () => {
    // 결과를 받는 시점엔 이미 표식 항목이 걷혀 있어야 곧바로 이동해도 엇갈리지 않는다.
    let markerAtResult: string | null | undefined;
    const onResult = vi.fn(() => {
      markerAtResult = overlayMarkerOf(window.history.state);
    });
    render(<ConfirmHarness onResult={onResult} />);
    fireEvent.click(screen.getByRole('button', { name: '삭제' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '확인' }));
      await settleHistory();
    });
    expect(onResult).toHaveBeenCalledWith(true);
    expect(markerAtResult).toBeNull();
    expect(currentPath()).toBe('/teams/1');
  });
});
