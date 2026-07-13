import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AdminPopupsPage from './page';

const createMutate = vi.fn();
const updateMutate = vi.fn();
const deleteMutate = vi.fn();

const popup = {
  noticeId: 'popup-1',
  audience: 'public' as const,
  category: '고정' as const,
  pinned: true,
  title: '서비스 점검 안내',
  body: '7월 15일 새벽에 서비스 점검을 진행합니다.',
  status: 'published' as const,
  publishedAt: '2026-07-13T00:00:00.000Z',
  archivedAt: null,
  createdAt: '2026-07-13T00:00:00.000Z',
  updatedAt: '2026-07-13T00:00:00.000Z',
};

vi.mock('@/hooks/use-v1-api', () => ({
  useV1AdminMe: () => ({ data: { capabilities: ['status:write'] } }),
  useV1AdminNotices: () => ({
    data: { items: [popup], pageInfo: { hasNext: false, nextCursor: null } },
    isPending: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  }),
  useV1AdminNoticeDetail: (noticeId: string) => ({
    data: noticeId ? { notice: popup } : undefined,
    isPending: false,
    isError: false,
    error: null,
  }),
  useV1CreateAdminNotice: () => ({ mutate: createMutate, isPending: false }),
  useV1UpdateAdminNotice: () => ({ mutate: updateMutate, isPending: false }),
  useV1DeleteAdminNotice: () => ({ mutate: deleteMutate, isPending: false }),
}));

describe('AdminPopupsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('supports popup list, detail, create, edit, and delete affordances', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<AdminPopupsPage />);

    expect(screen.getByRole('heading', { name: '팝업 관리' })).toBeInTheDocument();
    expect(screen.getByText('서비스 점검 안내')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '조회' }));
    expect((await screen.findAllByText('7월 15일 새벽에 서비스 점검을 진행합니다.')).length).toBeGreaterThan(1);

    await user.click(within(screen.getByLabelText('팝업 상세 조회')).getByRole('button', { name: '수정하기' }));
    expect(screen.getByRole('heading', { name: '팝업 수정' })).toBeInTheDocument();
    expect(screen.getByDisplayValue('서비스 점검 안내')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '새 팝업' }));
    expect(screen.getByRole('heading', { name: '새 팝업 생성' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '삭제' }));
    expect(window.confirm).toHaveBeenCalled();
    expect(deleteMutate).toHaveBeenCalledWith('popup-1', expect.any(Object));
  });
});
