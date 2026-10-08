import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IMAGE_TOO_LARGE_MESSAGE } from '@/lib/image-compress';
import { LeagueCoverImageControl } from './league-cover-image-control';

const { uploadAsync, saveMutate, canWrite } = vi.hoisted(() => ({
  uploadAsync: vi.fn(),
  saveMutate: vi.fn(),
  canWrite: { value: true },
}));
vi.mock('@/hooks/use-admin-can-write', () => ({ useAdminCanWrite: () => canWrite.value }));
vi.mock('@/hooks/use-v1-api', () => ({
  useV1UploadImages: () => ({ mutateAsync: uploadAsync, isPending: false }),
  useV1UpdateLeagueCoverImage: () => ({ mutate: saveMutate, isPending: false }),
}));

function renderControl(coverImageUrl: string | null = null) {
  return render(<LeagueCoverImageControl leagueId="league-1" sportCode="futsal" coverImageUrl={coverImageUrl} />);
}
const file = () => new File(['x'], 'cover.png', { type: 'image/png' });
const pick = () => fireEvent.change(screen.getByLabelText('대표 이미지 파일 선택'), { target: { files: [file()] } });

describe('LeagueCoverImageControl', () => {
  beforeEach(() => {
    uploadAsync.mockReset();
    saveMutate.mockReset();
    canWrite.value = true;
  });

  it('이미지가 없으면 "없음" 상태와 선택 버튼만, 있으면 "등록됨"과 변경·제거 버튼을 보여 준다', () => {
    const empty = renderControl();
    expect(screen.getByText('현재 상태: 없음 · 종목 그래픽으로 보여요')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '이미지 선택' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '제거' })).toBeNull();
    empty.unmount();

    renderControl('/uploads/2026/10/a.webp');
    expect(screen.getByText('현재 상태: 등록됨')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '이미지 변경' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '제거' })).toBeInTheDocument();
  });

  it('파일을 고르면 업로드한 URL 로 저장하고, 교체에는 확인 모달을 띄우지 않는다', async () => {
    uploadAsync.mockResolvedValue({ urls: ['/uploads/2026/10/new.webp'] });
    renderControl('/uploads/2026/10/old.webp');
    await act(async () => pick());
    expect(uploadAsync).toHaveBeenCalledTimes(1);
    expect(saveMutate.mock.calls[0][0]).toEqual({ coverImageUrl: '/uploads/2026/10/new.webp' });
    expect(screen.queryByRole('dialog')).toBeNull();
    act(() => saveMutate.mock.calls[0][1].onSuccess());
    expect(screen.getByRole('status')).toHaveTextContent('대표 이미지를 저장했어요.');
  });

  it('업로드가 실패하면 저장을 호출하지 않고 오류를 보여 준다', async () => {
    uploadAsync.mockRejectedValue(new Error(IMAGE_TOO_LARGE_MESSAGE));
    renderControl();
    await act(async () => pick());
    expect(saveMutate).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(IMAGE_TOO_LARGE_MESSAGE);
  });

  it('업로드는 됐지만 저장이 실패하면 그 사실을 알려 준다', async () => {
    uploadAsync.mockResolvedValue({ urls: ['/uploads/2026/10/new.webp'] });
    renderControl();
    await act(async () => pick());
    act(() => saveMutate.mock.calls[0][1].onError(new Error('boom')));
    expect(screen.getByRole('alert')).toHaveTextContent('이미지는 올렸지만 저장하지 못했어요. 다시 시도해 주세요.');
  });

  it('제거는 모달에서 확인한 뒤에만 null 을 보내고, 취소하면 보내지 않는다', () => {
    renderControl('/uploads/2026/10/old.webp');
    fireEvent.click(screen.getByRole('button', { name: '제거' }));
    expect(saveMutate).not.toHaveBeenCalled();
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '취소' }));
    expect(saveMutate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '제거' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '지우기' }));
    expect(saveMutate.mock.calls[0][0]).toEqual({ coverImageUrl: null });
  });

  it('권한이 없으면 입력과 버튼이 모두 꺼진다', () => {
    canWrite.value = false;
    renderControl('/uploads/2026/10/old.webp');
    expect(screen.getByLabelText('대표 이미지 파일 선택')).toBeDisabled();
    expect(screen.getByRole('button', { name: '이미지 변경' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '제거' })).toBeDisabled();
    expect(screen.getByText('현재 계정은 대표 이미지를 바꿀 권한이 없어요.')).toBeInTheDocument();
  });
});
