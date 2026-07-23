import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReleaseVersionWatcher } from './release-version-watcher';

function mockHealthResponse(release: string | null) {
  return {
    headers: { get: (name: string) => (name === 'x-teameet-release' ? release : null) },
  } as Response;
}

describe('ReleaseVersionWatcher', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let reloadMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    reloadMock = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload: reloadMock });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('does nothing when the environment has no release header (local dev / production without the header)', async () => {
    fetchMock.mockResolvedValue(mockHealthResponse(null));

    render(<ReleaseVersionWatcher />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    await vi.advanceTimersByTimeAsync(3 * 60 * 1000);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(reloadMock).not.toHaveBeenCalled();
  });

  it('only captures a baseline on the first check and shows nothing yet', async () => {
    fetchMock.mockResolvedValue(mockHealthResponse('1.0.0-alpha.20260723.gaaaaaaaaaaa'));

    render(<ReleaseVersionWatcher />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(reloadMock).not.toHaveBeenCalled();
  });

  it('shows the update overlay and reloads once a later check sees a different release', async () => {
    fetchMock
      .mockResolvedValueOnce(mockHealthResponse('1.0.0-alpha.20260723.gaaaaaaaaaaa'))
      .mockResolvedValueOnce(mockHealthResponse('1.0.0-alpha.20260723.gbbbbbbbbbbb'));

    render(<ReleaseVersionWatcher />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    await vi.advanceTimersByTimeAsync(3 * 60 * 1000);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    expect(screen.getByRole('status')).toHaveTextContent('새 버전으로 업데이트하고 있어요');
    expect(reloadMock).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1500);
    expect(reloadMock).toHaveBeenCalledTimes(1);
  });

  it('stops polling once a reload has already been scheduled', async () => {
    fetchMock
      .mockResolvedValueOnce(mockHealthResponse('1.0.0-alpha.20260723.gaaaaaaaaaaa'))
      .mockResolvedValueOnce(mockHealthResponse('1.0.0-alpha.20260723.gbbbbbbbbbbb'));

    render(<ReleaseVersionWatcher />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    await vi.advanceTimersByTimeAsync(3 * 60 * 1000);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    await vi.advanceTimersByTimeAsync(3 * 60 * 1000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
