import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AdminPopupsPage from './page';
import type { V1AdminPopupRow } from '@/types/api';

const createMutate = vi.fn();
const updateMutate = vi.fn();
const deleteMutate = vi.fn();

const popup: V1AdminPopupRow = {
  popupId: 'popup-1',
  audience: 'public' as const,
  title: '서비스 점검 안내',
  body: '7월 15일 새벽에 서비스 점검을 진행합니다.',
  targetScreens: ['home', 'matches'],
  linkUrl: '/matches',
  linkLabel: '매치 보기',
  status: 'published' as const,
  publishedAt: '2026-07-13T00:00:00.000Z',
  archivedAt: null,
  displayStartAt: '2026-07-14T00:00:00.000Z',
  displayEndAt: '2026-07-20T00:00:00.000Z',
  createdAt: '2026-07-13T00:00:00.000Z',
  updatedAt: '2026-07-13T00:00:00.000Z',
};

vi.mock('@/hooks/use-v1-api', () => ({
  useV1AdminMe: () => ({ data: { capabilities: ['status:write'] } }),
  useV1AdminPopups: () => ({
    data: { items: [popup], pageInfo: { hasNext: false, nextCursor: null } },
    isPending: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  }),
  useV1AdminPopupDetail: (popupId: string) => ({
    data: popupId ? { popup } : undefined,
    isPending: false,
    isError: false,
    error: null,
  }),
  useV1CreateAdminPopup: () => ({ mutate: createMutate, isPending: false }),
  useV1UpdateAdminPopup: () => ({ mutate: updateMutate, isPending: false }),
  useV1DeleteAdminPopup: () => ({ mutate: deleteMutate, isPending: false }),
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

  it('edits popup visibility as public, private, or draft with a display window', async () => {
    const user = userEvent.setup();
    render(<AdminPopupsPage />);

    await user.click(screen.getByRole('button', { name: '수정' }));

    const status = screen.getByLabelText('공개 상태');
    expect(within(status).getByRole('option', { name: '공개' })).toBeInTheDocument();
    expect(within(status).getByRole('option', { name: '비공개' })).toBeInTheDocument();
    expect(within(status).getByRole('option', { name: '초안' })).toBeInTheDocument();
    expect(screen.getByLabelText('노출 시작')).not.toHaveValue('');
    expect(screen.getByLabelText('노출 종료')).not.toHaveValue('');
    expect(screen.getByRole('checkbox', { name: /홈/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /개인 매치/ })).toBeChecked();
    expect(screen.getByLabelText(/이동 링크/)).toHaveValue('/matches');

    await user.selectOptions(status, 'archived');
    await user.click(screen.getByRole('checkbox', { name: /팀 매칭/ }));
    await user.clear(screen.getByLabelText(/버튼 문구/));
    await user.type(screen.getByLabelText(/버튼 문구/), '확인하기');
    await user.click(screen.getByRole('button', { name: '수정 저장' }));

    expect(updateMutate).toHaveBeenCalledWith(
      {
        popupId: 'popup-1',
        body: expect.objectContaining({
          status: 'archived',
          targetScreens: ['home', 'matches', 'team_matches'],
          linkUrl: '/matches',
          linkLabel: '확인하기',
          displayStartAt: '2026-07-14T00:00:00.000Z',
          displayEndAt: '2026-07-20T00:00:00.000Z',
        }),
      },
      expect.any(Object),
    );
  });

  it('requires at least one target screen', async () => {
    const user = userEvent.setup();
    render(<AdminPopupsPage />);

    await user.click(screen.getByRole('button', { name: '수정' }));
    await user.click(screen.getByRole('checkbox', { name: /홈/ }));
    await user.click(screen.getByRole('checkbox', { name: /개인 매치/ }));
    await user.click(screen.getByRole('button', { name: '수정 저장' }));

    expect(screen.getByText('노출할 화면을 하나 이상 선택해 주세요.')).toBeInTheDocument();
    expect(updateMutate).not.toHaveBeenCalled();
  });

  it('does not submit when the display end is not later than the start', async () => {
    const user = userEvent.setup();
    render(<AdminPopupsPage />);

    await user.click(screen.getByRole('button', { name: '수정' }));
    fireEvent.change(screen.getByLabelText('노출 시작'), { target: { value: '2026-07-20T10:00' } });
    fireEvent.change(screen.getByLabelText('노출 종료'), { target: { value: '2026-07-20T10:00' } });
    await user.click(screen.getByRole('button', { name: '수정 저장' }));

    expect(screen.getByText('노출 종료는 노출 시작보다 늦어야 해요.')).toBeInTheDocument();
    expect(updateMutate).not.toHaveBeenCalled();
  });
});
