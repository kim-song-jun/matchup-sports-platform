/**
 * **배포 후 청크가 사라진 탭이 영원히 복구되지 않던 결함.**
 *
 * `global-error` 는 자기 `<html><body>` 를 렌더해 루트 레이아웃을 대체하므로, 평소 배포를
 * 감지해 리로드하던 `ReleaseVersionWatcher` 가 이 화면이 뜨는 순간 언마운트된다. 그리고
 * "다시 시도"(`reset`)는 에러 경계 하위를 다시 그릴 뿐 문서를 다시 받지 않아 사라진 청크
 * URL 을 또 요청한다 — 눌러도 낫지 않는다.
 *
 * 여기서 못 박는 계약은 두 방향이다:
 *   · 청크 실패면 자동으로 한 번 하드 리로드하고, 버튼도 하드 리로드다.
 *   · **그 밖의 렌더 에러는 절대 리로드하지 않는다** — 코드 버그로 매번 터지는 화면을
 *     자동 리로드하면 무한 루프가 되어 지금보다 나쁘다.
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import GlobalError from './global-error';

vi.mock('@/lib/client-error-reporter', () => ({ reportClientError: vi.fn() }));

function chunkError(): Error {
  return new Error(
    'Failed to load chunk /_next/static/chunks/32kggqh2z2148.js from module 90223',
  );
}

describe('global-error — 청크 로드 실패 복구', () => {
  let reloadMock: ReturnType<typeof vi.fn>;
  let postMessageMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    reloadMock = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload: reloadMock });
    postMessageMock = vi.fn();
    vi.stubGlobal('navigator', {
      ...window.navigator,
      serviceWorker: { controller: { postMessage: postMessageMock } },
    });
    window.sessionStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    window.sessionStorage.clear();
  });

  async function flush() {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
  }

  it('청크 실패면 자동으로 하드 리로드하고 SW 정적 캐시도 지운다', async () => {
    render(<GlobalError error={chunkError()} reset={vi.fn()} />);
    await flush();

    expect(reloadMock).toHaveBeenCalledTimes(1);
    expect(postMessageMock).toHaveBeenCalledWith({ type: 'TEAMEET_RELEASE_CHANGED' });
    expect(screen.getByText('앱이 업데이트됐어요')).toBeInTheDocument();
  });

  it('최근에 이미 리로드했으면 자동 리로드하지 않고 화면을 남긴다', async () => {
    window.sessionStorage.setItem('teameet.chunk-reload', String(Date.now()));

    render(<GlobalError error={chunkError()} reset={vi.fn()} />);
    await flush();

    expect(reloadMock).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '새로고침' })).toBeInTheDocument();
  });

  it('표식이 오래됐으면 다시 한 번 자동 리로드한다', async () => {
    window.sessionStorage.setItem('teameet.chunk-reload', String(Date.now() - 60_000));

    render(<GlobalError error={chunkError()} reset={vi.fn()} />);
    await flush();

    expect(reloadMock).toHaveBeenCalledTimes(1);
  });

  it('청크가 아닌 렌더 에러는 리로드하지 않는다 — 무한 루프 방지', async () => {
    const reset = vi.fn();
    render(<GlobalError error={new Error("Cannot read properties of undefined (reading 'id')")} reset={reset} />);
    await flush();

    expect(reloadMock).not.toHaveBeenCalled();
    expect(postMessageMock).not.toHaveBeenCalled();
    expect(screen.getByText('화면을 다시 불러올 수 없어요')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(reset).toHaveBeenCalledTimes(1);
    expect(reloadMock).not.toHaveBeenCalled();
  });

  it('청크 실패의 버튼은 reset 이 아니라 하드 리로드다', async () => {
    window.sessionStorage.setItem('teameet.chunk-reload', String(Date.now()));
    const reset = vi.fn();
    render(<GlobalError error={chunkError()} reset={reset} />);
    await flush();
    expect(reloadMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '새로고침' }));
    await flush();

    expect(reset).not.toHaveBeenCalled();
    expect(reloadMock).toHaveBeenCalledTimes(1);
  });
});
