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
  content: {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: '7월 15일 새벽에 서비스 점검을 진행합니다.' }] }],
  },
  contentVersion: 1,
  targetScreens: ['home', 'matches'],
  targetPaths: [],
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

const { searchParamsMock } = vi.hoisted(() => ({ searchParamsMock: { value: new URLSearchParams() } }));

vi.mock('next/navigation', () => ({
  useSearchParams: () => searchParamsMock.value,
}));

vi.mock('@/hooks/use-v1-api', () => ({
  useV1AdminMe: () => ({ data: { capabilities: ['status:write'] } }),
  useV1AdminTournaments: () => ({
    data: { items: [{ id: 'tournament-1', title: '서울 풋살 챔피언십' }] },
    isPending: false,
  }),
  useV1AdminPopups: () => ({
    data: {
      items: [popup],
      pageInfo: { hasNext: false, nextCursor: null },
      summary: { total: 1, byStatus: { published: 1, archived: 0, draft: 0 } },
    },
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
  useV1UploadAdminContentAsset: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useV1DeleteAdminContentAsset: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

describe('AdminPopupsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    searchParamsMock.value = new URLSearchParams();
  });

  it('supports popup list, detail, create, edit, and delete affordances', async () => {
    const user = userEvent.setup();
    render(<AdminPopupsPage />);

    expect(screen.getByRole('heading', { name: '팝업 관리' })).toBeInTheDocument();
    expect(screen.getAllByText('서비스 점검 안내')[0]).toBeInTheDocument();

    await user.click(screen.getAllByRole('button', { name: '조회' })[0]);
    expect((await screen.findAllByText('7월 15일 새벽에 서비스 점검을 진행합니다.')).length).toBeGreaterThan(1);

    await user.click(within(screen.getByLabelText('팝업 상세 조회')).getByRole('button', { name: '수정하기' }));
    expect(screen.getByRole('heading', { name: '팝업 수정' })).toBeInTheDocument();
    expect(screen.getByDisplayValue('서비스 점검 안내')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '새 팝업' }));
    expect(screen.getByRole('heading', { name: '새 팝업 생성' })).toBeInTheDocument();

    await user.click(screen.getAllByRole('button', { name: '삭제' })[0]);
    // window.confirm 대신 공용 ConfirmModal이 뜨고, 모달의 '삭제' 확인을 눌러야 mutation이 실행된다
    const confirmDialog = await screen.findByRole('dialog', { name: '팝업을 삭제할까요?' });
    await user.click(within(confirmDialog).getByRole('button', { name: '삭제' }));
    expect(deleteMutate).toHaveBeenCalledWith('popup-1', expect.any(Object));
  });

  // 대회별 팝업 화면을 없애고 이 화면 하나로 합쳤다 — 대회 어드민의 '팝업' 항목이 넘겨주는
  // `?targetPath=/tournaments/<id>` 가 곧 "이 대회의 팝업"이라는 유일한 연결고리다.
  it('opens the create form prefilled from a targetPath deep link', async () => {
    searchParamsMock.value = new URLSearchParams({ targetPath: '/tournaments/tournament-1' });
    render(<AdminPopupsPage />);

    expect(await screen.findByRole('heading', { name: '새 팝업 생성' })).toBeInTheDocument();
    expect(screen.getByLabelText('정확한 내부 경로')).toHaveValue('/tournaments/tournament-1');
    // 경로 전용 타겟이어야 한다 — 대회 화면 그룹까지 켜지면 모든 대회 페이지에서 뜬다.
    expect(screen.getByRole('checkbox', { name: /대회 목록/ })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: /홈/ })).not.toBeChecked();
  });

  it('ignores an unsafe targetPath deep link', async () => {
    searchParamsMock.value = new URLSearchParams({ targetPath: '/admin/tournaments/tournament-1' });
    render(<AdminPopupsPage />);

    expect(screen.queryByRole('heading', { name: '새 팝업 생성' })).not.toBeInTheDocument();
  });

  it('edits popup visibility as public, private, or draft with a display window', async () => {
    const user = userEvent.setup();
    render(<AdminPopupsPage />);

    await user.click(screen.getAllByRole('button', { name: '수정' })[0]);

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

    await user.click(screen.getAllByRole('button', { name: '수정' })[0]);
    await user.click(screen.getByRole('checkbox', { name: /홈/ }));
    await user.click(screen.getByRole('checkbox', { name: /개인 매치/ }));
    await user.click(screen.getByRole('button', { name: '수정 저장' }));

    expect(screen.getByText('노출할 화면 그룹이나 정확한 경로를 하나 이상 설정해 주세요.')).toBeInTheDocument();
    expect(updateMutate).not.toHaveBeenCalled();
  });

  it('targets one tournament detail with an exact generated path', async () => {
    const user = userEvent.setup();
    render(<AdminPopupsPage />);

    await user.click(screen.getAllByRole('button', { name: '수정' })[0]);
    await user.selectOptions(screen.getByLabelText('특정 대회 상세'), 'tournament-1');

    expect(screen.getByLabelText('정확한 내부 경로')).toHaveValue('/tournaments/tournament-1');
    await user.click(screen.getByRole('button', { name: '수정 저장' }));

    expect(updateMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({ targetPaths: ['/tournaments/tournament-1'] }),
      }),
      expect.any(Object),
    );
  });

  it('does not submit when the display end is not later than the start', async () => {
    const user = userEvent.setup();
    render(<AdminPopupsPage />);

    await user.click(screen.getAllByRole('button', { name: '수정' })[0]);
    fireEvent.change(screen.getByLabelText('노출 시작'), { target: { value: '2026-07-20T10:00' } });
    fireEvent.change(screen.getByLabelText('노출 종료'), { target: { value: '2026-07-20T10:00' } });
    await user.click(screen.getByRole('button', { name: '수정 저장' }));

    expect(screen.getByText('노출 종료는 노출 시작보다 늦어야 해요.')).toBeInTheDocument();
    expect(updateMutate).not.toHaveBeenCalled();
  });
});
