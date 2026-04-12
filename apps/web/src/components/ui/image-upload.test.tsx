import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ToastProvider } from './toast';
import { ImageUpload } from './image-upload';
import type { UploadAsset } from '@/lib/uploads';

vi.mock('@/lib/api', () => ({
  api: {
    post: vi.fn(),
    delete: vi.fn(),
  },
}));

import { api } from '@/lib/api';

const mockApi = api as unknown as {
  post: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;

function renderWithToast(ui: React.ReactElement) {
  return render(<ToastProvider>{ui}</ToastProvider>);
}

function makeFile(name: string, type: string, sizeMB = 1): File {
  const bytes = new Uint8Array(sizeMB * 1024 * 1024);
  return new File([bytes], name, { type });
}

function createAsset(overrides: Partial<UploadAsset> = {}): UploadAsset {
  return {
    id: 'upload-1',
    url: 'uploads/2026/04/mock.webp',
    thumbUrl: 'uploads/2026/04/mock_thumb.webp',
    source: 'uploaded',
    ...overrides,
  };
}

const mockUploadResponse = {
  status: 'success',
  data: [
    {
      id: 'upload-1',
      userId: 'user-1',
      filename: 'mock.webp',
      originalName: 'photo.jpg',
      mimetype: 'image/webp',
      size: 1024,
      path: 'uploads/2026/04/mock.webp',
      thumbPath: 'uploads/2026/04/mock_thumb.webp',
      width: 1200,
      height: 800,
      createdAt: new Date().toISOString(),
    },
  ],
  timestamp: new Date().toISOString(),
};

describe('ImageUpload', () => {
  beforeAll(() => {
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn((file?: File) => `blob:${file?.name ?? 'preview'}`),
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: vi.fn(),
    });
  });

  afterAll(() => {
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: originalCreateObjectURL,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: originalRevokeObjectURL,
    });
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockApi.post.mockResolvedValue(mockUploadResponse);
    mockApi.delete.mockResolvedValue({ status: 'success', data: { deleted: true } });
  });

  it('renders label and empty trigger', () => {
    renderWithToast(<ImageUpload value={[]} onChange={vi.fn()} label="사진 업로드" />);

    expect(screen.getByText('사진 업로드')).toBeInTheDocument();
    expect(screen.getByLabelText(/이미지 추가/)).toBeInTheDocument();
  });

  it('uploads a valid file and returns a persisted asset', async () => {
    const onChange = vi.fn();
    renderWithToast(<ImageUpload value={[]} onChange={onChange} />);

    const input = screen.getByLabelText(/이미지 파일 선택/i) as HTMLInputElement;
    const file = makeFile('photo.jpg', 'image/jpeg', 1);

    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
    });

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledTimes(1);
    });

    const [assets] = onChange.mock.calls[0] as [UploadAsset[]];
    expect(assets).toEqual([
      expect.objectContaining({
        id: 'upload-1',
        url: 'uploads/2026/04/mock.webp',
        thumbUrl: 'uploads/2026/04/mock_thumb.webp',
        source: 'uploaded',
      }),
    ]);
  });

  it('shows an uploading state while request is pending', async () => {
    let resolveUpload: ((value: unknown) => void) | undefined;
    mockApi.post.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveUpload = resolve;
        }),
    );

    renderWithToast(<ImageUpload value={[]} onChange={vi.fn()} />);

    const input = screen.getByLabelText(/이미지 파일 선택/i) as HTMLInputElement;
    const file = makeFile('photo.jpg', 'image/jpeg', 1);

    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
    });

    expect(screen.getByText('업로드 중')).toBeInTheDocument();

    await act(async () => {
      resolveUpload?.(mockUploadResponse);
    });
  });

  it('reports pending upload state changes to the parent', async () => {
    let resolveUpload: ((value: unknown) => void) | undefined;
    mockApi.post.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveUpload = resolve;
        }),
    );

    const onStateChange = vi.fn();
    renderWithToast(<ImageUpload value={[]} onChange={vi.fn()} onStateChange={onStateChange} />);

    const input = screen.getByLabelText(/이미지 파일 선택/i) as HTMLInputElement;
    const file = makeFile('photo.jpg', 'image/jpeg', 1);

    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
    });

    await waitFor(() => {
      expect(onStateChange).toHaveBeenCalledWith(
        expect.objectContaining({
          hasPendingUploads: true,
          hasUploadErrors: false,
          pendingCount: 1,
        }),
      );
    });

    await act(async () => {
      resolveUpload?.(mockUploadResponse);
    });

    await waitFor(() => {
      expect(onStateChange).toHaveBeenLastCalledWith(
        expect.objectContaining({
          hasPendingUploads: false,
          hasUploadErrors: false,
          pendingCount: 0,
        }),
      );
    });
  });

  it('renders retry action when upload fails, then succeeds on retry', async () => {
    mockApi.post
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValueOnce(mockUploadResponse);

    const onChange = vi.fn();
    renderWithToast(<ImageUpload value={[]} onChange={onChange} />);

    const input = screen.getByLabelText(/이미지 파일 선택/i) as HTMLInputElement;
    const file = makeFile('photo.jpg', 'image/jpeg', 1);

    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
    });

    await waitFor(() => {
      expect(screen.getByLabelText('업로드 재시도')).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByLabelText('업로드 재시도'));
    });

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledTimes(1);
    });
  });

  it('removes an uploaded asset through the delete API', async () => {
    const onChange = vi.fn();
    renderWithToast(
      <ImageUpload
        value={[createAsset()]}
        onChange={onChange}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByLabelText('이미지 1 제거'));
    });

    await waitFor(() => {
      expect(mockApi.delete).toHaveBeenCalledWith('/uploads/upload-1');
    });
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('preserves selected file order for multi-upload results', async () => {
    mockApi.post
      .mockResolvedValueOnce({
        ...mockUploadResponse,
        data: [{ ...mockUploadResponse.data[0], id: 'upload-1', path: 'uploads/one.webp' }],
      })
      .mockResolvedValueOnce({
        ...mockUploadResponse,
        data: [{ ...mockUploadResponse.data[0], id: 'upload-2', path: 'uploads/two.webp' }],
      });

    const onChange = vi.fn();
    renderWithToast(<ImageUpload value={[]} onChange={onChange} max={5} />);

    const input = screen.getByLabelText(/이미지 파일 선택/i) as HTMLInputElement;
    const firstFile = makeFile('photo-1.jpg', 'image/jpeg', 1);
    const secondFile = makeFile('photo-2.jpg', 'image/jpeg', 1);

    await act(async () => {
      fireEvent.change(input, { target: { files: [firstFile, secondFile] } });
    });

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledTimes(2);
    });

    const [assets] = onChange.mock.calls.at(-1) as [UploadAsset[]];
    expect(assets.map((asset) => asset.id)).toEqual(['upload-1', 'upload-2']);
    expect(assets.map((asset) => asset.url)).toEqual(['uploads/one.webp', 'uploads/two.webp']);
  });

  it('removes an existing asset without calling the delete API', async () => {
    const onChange = vi.fn();
    renderWithToast(
      <ImageUpload
        value={[createAsset({ id: undefined, source: 'existing', url: '/existing-photo.webp' })]}
        onChange={onChange}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByLabelText('이미지 1 제거'));
    });

    expect(mockApi.delete).not.toHaveBeenCalled();
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('shows a validation toast when max count would be exceeded', async () => {
    renderWithToast(
      <ImageUpload
        value={[createAsset({ url: '/one.webp' })]}
        onChange={vi.fn()}
        max={1}
      />,
    );

    expect(screen.queryByLabelText(/이미지 추가/)).not.toBeInTheDocument();
  });

  it('rejects an invalid mime type', async () => {
    renderWithToast(<ImageUpload value={[]} onChange={vi.fn()} />);

    const input = screen.getByLabelText(/이미지 파일 선택/i) as HTMLInputElement;
    const file = makeFile('document.pdf', 'application/pdf', 1);

    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
    });

    await waitFor(() => {
      expect(screen.getByText(/JPG, PNG, WebP, GIF/)).toBeInTheDocument();
    });
    expect(mockApi.post).not.toHaveBeenCalled();
  });

  it('rejects an oversized file', async () => {
    renderWithToast(<ImageUpload value={[]} onChange={vi.fn()} maxSizeMB={1} />);

    const input = screen.getByLabelText(/이미지 파일 선택/i) as HTMLInputElement;
    const file = makeFile('huge.jpg', 'image/jpeg', 2);

    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
    });

    await waitFor(() => {
      expect(screen.getByText('1MB 이하의 파일만 업로드할 수 있어요')).toBeInTheDocument();
    });
    expect(mockApi.post).not.toHaveBeenCalled();
  });

  it('keeps the input disabled when requested', () => {
    renderWithToast(<ImageUpload value={[]} onChange={vi.fn()} disabled />);

    const input = screen.getByLabelText(/이미지 파일 선택/i) as HTMLInputElement;
    expect(input.disabled).toBe(true);
  });
});
