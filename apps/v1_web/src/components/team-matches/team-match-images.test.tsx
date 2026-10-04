import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { TeamMatchImagesField, teamMatchImage } from './team-match-images';

describe('team match image slots', () => {
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
    await waitFor(() => expect(screen.getByRole('img', { name: '상세 이미지 미리보기' }).style.backgroundImage).toContain('/uploads/square.webp'));
    fireEvent.change(screen.getByLabelText('상세 이미지'), { target: { files: [new File(['wide'], 'wide.webp', { type: 'image/webp' })] } });
    await waitFor(() => expect(screen.getByRole('img', { name: '상세 이미지 미리보기' }).style.backgroundImage).toContain('/uploads/wide.webp'));
    expect(screen.getByRole('img', { name: '목록 이미지 미리보기' }).style.backgroundImage).toContain('/uploads/square.webp');
    fireEvent.click(screen.getByRole('button', { name: '목록 이미지 제거' }));
    expect(screen.getByRole('img', { name: '목록 이미지 미리보기' }).style.backgroundImage).toContain('/uploads/wide.webp');
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
    expect(screen.getByRole('img', { name: '목록 이미지 미리보기' }).style.backgroundImage).toContain('/uploads/saved.webp');
    expect(screen.getByLabelText('상세 이미지')).not.toBeDisabled();
  });
});
