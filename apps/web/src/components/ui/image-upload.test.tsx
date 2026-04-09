import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { ToastProvider } from './toast';

// Mock the api module so we control upload responses in unit tests
vi.mock('@/lib/api', () => ({
  api: {
    post: vi.fn(),
  },
}));

import { api } from '@/lib/api';
import { ImageUpload } from './image-upload';

const mockApi = api as unknown as { post: ReturnType<typeof vi.fn> };

// Wrap component with ToastProvider so useToast works
function renderWithToast(ui: React.ReactElement) {
  return render(<ToastProvider>{ui}</ToastProvider>);
}

function makeFile(name: string, type: string, sizeMB = 1): File {
  const bytes = new Uint8Array(sizeMB * 1024 * 1024);
  return new File([bytes], name, { type });
}

const mockUploadResponse = {
  status: 'success',
  data: [
    {
      id: 'upload-1',
      path: '/uploads/2026/04/mock.webp',
      width: 1200,
      height: 800,
    },
  ],
  timestamp: new Date().toISOString(),
};

describe('ImageUpload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: resolve with a successful upload response
    mockApi.post.mockResolvedValue(mockUploadResponse);
  });

  it('renders upload label and trigger', () => {
    renderWithToast(
      <ImageUpload value={[]} onChange={vi.fn()} label="사진 업로드" />,
    );
    expect(screen.getByText('사진 업로드')).toBeInTheDocument();
    expect(screen.getByLabelText(/이미지 추가/)).toBeInTheDocument();
  });

  it('happy: selecting a valid file calls onChange with the uploaded URL', async () => {
    const onChange = vi.fn();
    renderWithToast(
      <ImageUpload value={[]} onChange={onChange} />,
    );

    const input = screen.getByLabelText(/이미지 파일 선택/i) as HTMLInputElement;
    const file = makeFile('photo.jpg', 'image/jpeg', 0.5);

    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
    });

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledTimes(1);
    });

    const [urls] = onChange.mock.calls[0] as [string[]];
    expect(Array.isArray(urls)).toBe(true);
    expect(urls).toContain('/uploads/2026/04/mock.webp');
  });

  it('shows remove buttons for existing images', () => {
    const onChange = vi.fn();
    renderWithToast(
      <ImageUpload value={['/uploads/a.webp', '/uploads/b.webp']} onChange={onChange} />,
    );
    expect(screen.getByLabelText('이미지 1 제거')).toBeInTheDocument();
    expect(screen.getByLabelText('이미지 2 제거')).toBeInTheDocument();
  });

  it('remove button click calls onChange with the URL removed', () => {
    const onChange = vi.fn();
    renderWithToast(
      <ImageUpload
        value={['/uploads/a.webp', '/uploads/b.webp']}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByLabelText('이미지 1 제거'));
    expect(onChange).toHaveBeenCalledWith(['/uploads/b.webp']);
  });

  it('error: max reached — upload button not rendered', () => {
    renderWithToast(
      <ImageUpload value={['/a.webp', '/b.webp', '/c.webp']} onChange={vi.fn()} max={3} />,
    );

    // Upload trigger label disappears when value.length === max
    expect(screen.queryByLabelText(/이미지 추가/)).not.toBeInTheDocument();
  });

  it('error: max exceeded via file selection shows toast', async () => {
    const onChange = vi.fn();
    renderWithToast(
      <ImageUpload value={['/a.webp']} onChange={onChange} max={2} />,
    );

    const input = screen.getByLabelText(/이미지 파일 선택/i) as HTMLInputElement;
    // Attempt to add 2 files when only 1 slot remains
    const file1 = makeFile('a.jpg', 'image/jpeg', 0.1);
    const file2 = makeFile('b.jpg', 'image/jpeg', 0.1);

    await act(async () => {
      fireEvent.change(input, { target: { files: [file1, file2] } });
    });

    await waitFor(() => {
      expect(screen.getByText(/최대 2장까지/)).toBeInTheDocument();
    });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('error: invalid MIME type shows toast and does NOT call onChange', async () => {
    const onChange = vi.fn();
    renderWithToast(
      <ImageUpload value={[]} onChange={onChange} accept="image/jpeg,image/png,image/webp" />,
    );

    const input = screen.getByLabelText(/이미지 파일 선택/i) as HTMLInputElement;
    const badFile = makeFile('document.pdf', 'application/pdf', 0.1);

    await act(async () => {
      fireEvent.change(input, { target: { files: [badFile] } });
    });

    await waitFor(() => {
      expect(screen.getByText(/JPG, PNG, WebP/)).toBeInTheDocument();
    });
    expect(onChange).not.toHaveBeenCalled();
    expect(mockApi.post).not.toHaveBeenCalled();
  });

  it('error: file size exceeded shows toast and does NOT call onChange', async () => {
    const onChange = vi.fn();
    renderWithToast(
      <ImageUpload value={[]} onChange={onChange} maxSizeMB={1} />,
    );

    const input = screen.getByLabelText(/이미지 파일 선택/i) as HTMLInputElement;
    const bigFile = makeFile('huge.jpg', 'image/jpeg', 2); // 2MB > 1MB limit

    await act(async () => {
      fireEvent.change(input, { target: { files: [bigFile] } });
    });

    await waitFor(() => {
      expect(screen.getByText(/1MB 이하/)).toBeInTheDocument();
    });
    expect(onChange).not.toHaveBeenCalled();
    expect(mockApi.post).not.toHaveBeenCalled();
  });

  it('error: network failure shows error toast', async () => {
    mockApi.post.mockRejectedValueOnce(new Error('Network error'));

    const onChange = vi.fn();
    renderWithToast(
      <ImageUpload value={[]} onChange={onChange} />,
    );

    const input = screen.getByLabelText(/이미지 파일 선택/i) as HTMLInputElement;
    const file = makeFile('photo.jpg', 'image/jpeg', 0.5);

    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
    });

    await waitFor(() => {
      expect(screen.getByText(/업로드에 실패했어요/)).toBeInTheDocument();
    });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('disabled state: input is disabled', () => {
    renderWithToast(
      <ImageUpload value={[]} onChange={vi.fn()} disabled />,
    );

    const input = screen.getByLabelText(/이미지 파일 선택/i) as HTMLInputElement;
    expect(input.disabled).toBe(true);
  });
});
