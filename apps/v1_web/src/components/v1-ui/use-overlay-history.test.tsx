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
import { __resetOverlayHistoryForTests, closeOverlayThenNavigate, overlayMarkerOf } from '@/lib/overlay-history';
import { currentPath, settleHistory } from '@/test/history-router';
import { useConfirm } from './confirm-modal';
import { useModalA11y } from './use-modal-a11y';
import { NavigationHistoryTracker } from './navigation-history-tracker';

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn() }) }));

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

describe('ESC — 겹친 모달', () => {
  it('맨 위 모달 하나만 닫는다', () => {
    render(<TwoModals />);
    fireEvent.click(screen.getByRole('button', { name: 'A 열기' }));
    fireEvent.click(screen.getByRole('button', { name: 'B 열기' }));

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(dialogs()).toEqual(['A']);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(dialogs()).toEqual([]);
  });
});

describe('ConfirmModal — 호스트가 먼저 사라질 때', () => {
  it('열린 채 언마운트되면 false 로 끝난다(기다리는 쪽이 멈추지 않는다)', async () => {
    const onResult = vi.fn();
    const { unmount } = render(<ConfirmHarness onResult={onResult} />);
    fireEvent.click(screen.getByRole('button', { name: '삭제' }));
    unmount();
    await act(async () => {
      await settleHistory();
    });
    expect(onResult).toHaveBeenCalledWith(false);
  });

  it('확인과 같은 커밋에 언마운트돼도 결과가 온다', async () => {
    const onResult = vi.fn();
    function Host() {
      const [show, setShow] = useState(true);
      // 확인 클릭과 같은 이벤트에서 호스트를 걷는다(패널이 버블링을 막아 캡처로 듣는다).
      return <div onClickCapture={(event) => (event.target as HTMLElement).textContent === '확인' && setShow(false)}>{show ? <ConfirmHarness onResult={onResult} /> : null}</div>;
    }
    render(<Host />);
    fireEvent.click(screen.getByRole('button', { name: '삭제' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '확인' }));
      await settleHistory();
    });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(onResult).toHaveBeenCalledWith(true);
  });
});

describe('닫고 이동하기 — 닫기 back 과 이동 push 가 엇갈리지 않는다', () => {
  function ModalWithLink({ navigate }: { navigate: () => void }) {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button type="button" onClick={() => setOpen(true)}>열기</button>
        {open ? (
          <button type="button" onClick={() => void closeOverlayThenNavigate(() => setOpen(false), navigate)}>
            이동
          </button>
        ) : null}
        <Modal name="M" open={open} onClose={() => setOpen(false)} />
      </>
    );
  }

  it('back 이 100ms 넘게 늦어도 push 는 닫기 pop 이 끝난 뒤에 한다 — 새 페이지에 머물고 뒤로가기는 한 번에 이전 화면', async () => {
    const order: string[] = [];
    const realBack = window.history.back.bind(window.history);
    vi.spyOn(window.history, 'back').mockImplementation(() => {
      order.push('back');
      setTimeout(realBack, 150);
    });
    window.addEventListener('popstate', () => order.push('pop'), { capture: true });
    render(<ModalWithLink navigate={() => { order.push('push'); window.history.pushState({}, '', '/teams/2'); }} />);
    fireEvent.click(screen.getByRole('button', { name: '열기' }));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '이동' }));
      await new Promise((resolve) => setTimeout(resolve, 200));
      await settleHistory();
    });
    vi.mocked(window.history.back).mockRestore();

    expect(order).toEqual(['back', 'pop', 'push']);
    expect(currentPath()).toBe('/teams/2');
    expect(dialogs()).toEqual([]);
    await back();
    expect(currentPath()).toBe('/teams/1');
    expect(overlayMarkerOf(window.history.state)).toBeNull();
    await back();
    expect(currentPath()).toBe('/home');
  });

  it('닫기 back 이 표식 앞 항목(이전 화면)까지 한 번에 가도 그 pop 은 페이지 이동으로 흘리고 대기열을 남기지 않는다', async () => {
    const realGo = window.history.go.bind(window.history);
    vi.spyOn(window.history, 'back').mockImplementationOnce(() => realGo(-2)); // 닫기 back + 사용자 back 이 합쳐진 경우
    render(<TwoModals />);
    fireEvent.click(screen.getByRole('button', { name: 'A 열기' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'A 닫기' }));
      await settleHistory();
    });

    expect(currentPath()).toBe('/home');
    expect(nextRouterPop).toHaveBeenCalledTimes(1);
    expect(appPop).toHaveBeenCalledTimes(1);

    // 남은 대기열이 없다 — 다음 이동의 pop 을 삼키지 않는다.
    window.history.pushState({}, '', '/teams/3');
    await back();
    expect(currentPath()).toBe('/home');
    expect(appPop).toHaveBeenCalledTimes(2);
  });

  it('경로가 바뀐 뒤 닫히는 오버레이(모달 안 링크 이동)는 back 하지 않는다', async () => {
    const historyBack = vi.spyOn(window.history, 'back');
    const { rerender } = render(<Modal name="M" open onClose={() => {}} />);
    window.history.pushState({}, '', '/teams/2');
    rerender(<Modal name="M" open={false} onClose={() => {}} />);
    await act(async () => {
      await settleHistory();
    });
    expect(historyBack).not.toHaveBeenCalled();
    expect(currentPath()).toBe('/teams/2');
  });
});

// 드로어·팝업 링크는 표식을 걷지 않고 이동한다 — 남은 표식을 도착한 방향으로 건너뛰어야 한다.
describe('남은 표식 — 뒤로·앞으로 모두 건너뛴다', () => {
  const forward = async () => {
    await act(async () => {
      window.history.forward();
      await settleHistory();
    });
  };

  async function leaveThroughModalLink() {
    const { rerender } = render(<Modal name="M" open onClose={() => {}} />);
    window.history.pushState({}, '', '/teams/2');
    rerender(<Modal name="M" open={false} onClose={() => {}} />);
    await act(async () => {
      await settleHistory();
    });
  }

  it('뒤로는 이전 화면, 앞으로는 링크로 갔던 화면에 닿는다(표식 도착 pop 은 Next 에 안 간다)', async () => {
    await leaveThroughModalLink();
    await back();
    expect(currentPath()).toBe('/teams/1');
    expect(nextRouterPop).toHaveBeenCalledTimes(1); // 화면이 바뀐 pop 하나만
    nextRouterPop.mockClear();

    await forward();

    expect(currentPath()).toBe('/teams/2');
    expect(nextRouterPop).toHaveBeenCalledTimes(1);

    await back();
    expect(currentPath()).toBe('/teams/1');
    expect(overlayMarkerOf(window.history.state)).toBeNull();
  });

  it('a document reloaded before any overlay opens still skips the stale marker on forward', async () => {
    const tracker = render(<NavigationHistoryTracker />);
    await leaveThroughModalLink();
    await back();
    expect(currentPath()).toBe('/teams/1');

    // Cross-document return: fresh modules, only the app shell's tracker runs.
    tracker.unmount();
    __resetOverlayHistoryForTests();
    __resetNavigationHistoryForTests();
    render(<NavigationHistoryTracker />);

    await forward();
    expect(currentPath()).toBe('/teams/2');
  });
});
