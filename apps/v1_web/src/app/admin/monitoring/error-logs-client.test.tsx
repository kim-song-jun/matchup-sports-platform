import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { ErrorLogsClient } from './error-logs-client';
import type { V1AdminErrorLogDetail, V1AdminErrorLogListItem } from '@/types/api';

const LIST_ITEM: V1AdminErrorLogListItem = {
  id: 'err-1',
  source: 'server',
  level: 'error',
  statusCode: 500,
  errorCode: 'MATCH_NOT_FOUND',
  method: 'GET',
  route: '/matches/:id',
  message: '매치를 찾을 수 없습니다',
  occurrenceCount: 42,
  releaseSha: '0.1.0-alpha.20260726.g3069cd0025e0',
  firstSeenAt: '2026-07-25T00:00:00.000Z',
  lastSeenAt: '2026-07-26T00:00:00.000Z',
};

const DETAIL: V1AdminErrorLogDetail = {
  ...LIST_ITEM,
  stack: 'Error: 매치를 찾을 수 없습니다\n    at MatchesService.findOne',
  requestBody: { foo: 'bar' },
  requestHeaders: { authorization: '[REDACTED]' },
  responseBody: { error: 'MATCH_NOT_FOUND' },
  context: { screen: 'match-detail' },
  userId: 'user-1',
  userAgent: 'Mozilla/5.0',
};

const useAdminErrorLogsMock = vi.fn();
const useAdminErrorLogMock = vi.fn();

vi.mock('@/hooks/use-v1-api', () => ({
  useAdminErrorLogs: (...args: unknown[]) => useAdminErrorLogsMock(...args),
  useAdminErrorLog: (...args: unknown[]) => useAdminErrorLogMock(...args),
}));

describe('ErrorLogsClient', () => {
  const originalClipboard = navigator.clipboard;

  beforeEach(() => {
    vi.clearAllMocks();
    useAdminErrorLogsMock.mockReturnValue({
      data: { items: [LIST_ITEM], pageInfo: { nextCursor: null, hasNext: false } },
      isLoading: false,
      isError: false,
      error: undefined,
      refetch: vi.fn(),
    });
    useAdminErrorLogMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
      error: undefined,
    });
  });

  afterEach(() => {
    Object.defineProperty(navigator, 'clipboard', { value: originalClipboard, configurable: true });
  });

  it('renders the list with occurrence count and route', () => {
    render(<ErrorLogsClient />);

    expect(screen.getAllByText(/매치를 찾을 수 없습니다/).length).toBeGreaterThan(0);
    expect(screen.getAllByText('42').length).toBeGreaterThan(0);
    expect(screen.getAllByText('/matches/:id').length).toBeGreaterThan(0);
  });

  it('opens the detail modal when a row is clicked', async () => {
    useAdminErrorLogMock.mockReturnValue({
      data: DETAIL,
      isLoading: false,
      isError: false,
      error: undefined,
    });

    const user = userEvent.setup();
    render(<ErrorLogsClient />);

    await user.click(screen.getAllByRole('button', { name: /상세 보기/ })[0]);

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('shows traceback, request, and response sections in the modal', async () => {
    useAdminErrorLogMock.mockReturnValue({
      data: DETAIL,
      isLoading: false,
      isError: false,
      error: undefined,
    });

    const user = userEvent.setup();
    render(<ErrorLogsClient />);
    await user.click(screen.getAllByRole('button', { name: /상세 보기/ })[0]);

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Traceback')).toBeInTheDocument();
    expect(within(dialog).getByText('Request')).toBeInTheDocument();
    expect(within(dialog).getByText('Response')).toBeInTheDocument();
    expect(within(dialog).getByText(/MatchesService.findOne/)).toBeInTheDocument();

    // requestBody는 백엔드가 실제로 반환하는 구조(object)로 렌더링돼야 한다 — 문자열로
    // 이중 인코딩되면 `"foo": "bar"` 형태의 들여쓴 JSON이 아니라 이스케이프된 한 줄
    // (`"{\"foo\":\"bar\"}"`)로 보인다.
    expect(within(dialog).getByText(/"foo":\s*"bar"/)).toBeInTheDocument();
  });

  it('copies all sections to the clipboard when "전체 복사" is clicked', async () => {
    useAdminErrorLogMock.mockReturnValue({
      data: DETAIL,
      isLoading: false,
      isError: false,
      error: undefined,
    });
    const writeTextMock = vi.fn().mockResolvedValue(undefined);

    const user = userEvent.setup();
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: writeTextMock }, configurable: true });
    render(<ErrorLogsClient />);
    await user.click(screen.getAllByRole('button', { name: /상세 보기/ })[0]);
    await screen.findByRole('dialog');

    await user.click(screen.getByRole('button', { name: '전체 복사' }));

    await waitFor(() => expect(writeTextMock).toHaveBeenCalledTimes(1));
    const copied = writeTextMock.mock.calls[0][0] as string;
    expect(copied).toContain('## 메타');
    expect(copied).toContain('## Traceback');
    expect(copied).toContain('## Request');
    expect(copied).toContain('## Response');
  });
});
