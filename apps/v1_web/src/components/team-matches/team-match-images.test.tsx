import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { TeamMatchImagesField, teamMatchImage } from './team-match-images';
import { backgroundRequests } from './team-match-images.test-fixture';

function previewRequests(label: string) {
  return backgroundRequests(screen.getByRole('img', { name: `${label} 미리보기` }).style.backgroundImage);
}

describe('team match image slots', () => {
  it('keeps Korean guidance words together while allowing unusually long words to wrap', () => {
    render(<TeamMatchImagesField images={{}} sport="풋살" onChange={vi.fn()} />);
    const guidance = screen.getByText('이미지는 선택 사항이에요. 한 장만 올리면 목록과 상세에 함께 사용하고, 없으면 종목별 기본 이미지를 보여줘요.');
    const style = window.getComputedStyle(guidance);
    expect(style.wordBreak).toBe('keep-all');
    expect(style.overflowWrap).toBe('anywhere');
  });

  it('uses the intended image on each surface and shares a single image, including old records', () => {
    const images = { imageUrl: '/uploads/wide.webp', listImageUrl: '/uploads/square.webp' };
    expect(teamMatchImage(images, 'list')).toBe('/uploads/square.webp');
    expect(teamMatchImage(images, 'detail')).toBe('/uploads/wide.webp');
    expect(teamMatchImage({ imageUrl: images.imageUrl }, 'list')).toBe(images.imageUrl);
    expect(teamMatchImage({ listImageUrl: images.listImageUrl }, 'detail')).toBe(images.listImageUrl);
    expect(teamMatchImage({}, 'list')).toBeNull();
  });

  it('uploads both slots independently, then removes each image back to sport defaults', async () => {
    const upload = vi.fn().mockResolvedValueOnce('/uploads/square.webp').mockResolvedValueOnce('/uploads/wide.webp');
    function Form() {
      const [images, setImages] = useState({ imageUrl: '', listImageUrl: '' });
      return <TeamMatchImagesField images={images} sport="풋살" onUpload={upload} onChange={(field, value) => setImages((current) => ({ ...current, [field]: value }))} />;
    }
    render(<Form />);
    fireEvent.change(screen.getByLabelText('목록 이미지'), { target: { files: [new File(['square'], 'square.webp', { type: 'image/webp' })] } });
    await waitFor(() => expect(previewRequests('상세 이미지')[0]?.url).toBe('/uploads/square.webp'));
    fireEvent.change(screen.getByLabelText('상세 이미지'), { target: { files: [new File(['wide'], 'wide.webp', { type: 'image/webp' })] } });
    await waitFor(() => expect(previewRequests('상세 이미지')[0]?.url).toBe('/uploads/wide.webp'));
    expect(previewRequests('목록 이미지')[0]?.url).toBe('/uploads/square.webp');
    fireEvent.click(screen.getByRole('button', { name: '목록 이미지 제거' }));
    expect(previewRequests('목록 이미지')[0]?.url).toBe('/uploads/wide.webp');
    fireEvent.click(screen.getByRole('button', { name: '상세 이미지 제거' }));
    for (const label of ['목록 이미지', '상세 이미지']) {
      const src = screen.getByRole('img', { name: `${label} 미리보기` }).querySelector('img')?.getAttribute('src') ?? '';
      expect(decodeURIComponent(src)).toContain('/illustrations/sport-futsal-640.webp');
    }
  });

  it('blocks competing uploads and exposes failure while preserving the saved image', async () => {
    let reject!: (error: Error) => void;
    const upload = vi.fn(() => new Promise<string>((_, fail) => { reject = fail; }));
    const change = vi.fn();
    const busy = vi.fn();
    render(<TeamMatchImagesField images={{ imageUrl: '/uploads/saved.webp' }} sport="축구" onUpload={upload} onChange={change} onUploadingChange={busy} />);
    fireEvent.change(screen.getByLabelText('목록 이미지'), { target: { files: [new File(['image'], 'image.webp')] } });
    expect(screen.getByLabelText('상세 이미지')).toBeDisabled();
    expect(screen.getByRole('button', { name: '상세 이미지 제거' })).toBeDisabled();
    reject(new Error('업로드 연결 실패'));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('업로드 연결 실패'));
    expect(change).not.toHaveBeenCalled();
    expect(busy.mock.calls).toEqual([[true], [false]]);
    expect(previewRequests('목록 이미지')[0]?.url).toBe('/uploads/saved.webp');
    expect(screen.getByLabelText('상세 이미지')).not.toBeDisabled();
  });

  it('요청하는 이미지를 미리보기 칸 크기에 맞춘 폭으로 최적화해서 받는다', () => {
    render(<TeamMatchImagesField images={{ imageUrl: '/uploads/wide.png', listImageUrl: '/uploads/square.png' }} sport="축구" onChange={vi.fn()} />);

    // 정사각형 칸은 max-width 200px → 400 이상 중 가장 작은 640, 가로 칸은 600px 히어로와 같은 1200.
    expect(previewRequests('목록 이미지')[0]).toEqual({ pathname: '/_next/image', url: '/uploads/square.png', w: '640' });
    expect(previewRequests('상세 이미지')[0]).toEqual({ pathname: '/_next/image', url: '/uploads/wide.png', w: '1200' });
  });
});
