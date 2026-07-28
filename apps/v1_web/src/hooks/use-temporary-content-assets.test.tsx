import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { upload, remove } = vi.hoisted(() => ({
  upload: vi.fn(),
  remove: vi.fn(),
}));

vi.mock('@/hooks/use-v1-api', () => ({
  useV1UploadAdminContentAsset: () => ({ mutateAsync: upload, isPending: false }),
  useV1DeleteAdminContentAsset: () => ({ mutateAsync: remove, isPending: false }),
}));

import { useTemporaryContentAssets } from './use-temporary-content-assets';

const asset = {
  assetId: '123e4567-e89b-42d3-a456-426614174000',
  url: '/uploads/2026/07/123e4567-e89b-42d3-a456-426614174000.webp',
  status: 'temporary' as const,
};

const secondAsset = {
  assetId: '223e4567-e89b-42d3-a456-426614174000',
  url: '/uploads/2026/07/223e4567-e89b-42d3-a456-426614174000.png',
  status: 'temporary' as const,
};

describe('useTemporaryContentAssets', () => {
  beforeEach(() => {
    upload.mockReset().mockResolvedValue(asset);
    remove.mockReset().mockResolvedValue({ assetId: asset.assetId, deleted: true });
  });

  it('deletes a session upload that is not referenced when content is committed', async () => {
    const { result } = renderHook(() => useTemporaryContentAssets());

    await act(() => result.current.uploadImage(new File(['image'], 'notice.webp', { type: 'image/webp' })));
    await act(() => result.current.commit({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Saved without image' }] }],
    }));

    expect(remove).toHaveBeenCalledWith(asset.assetId);
  });

  it('deletes every session upload when the editor is cancelled', async () => {
    const { result } = renderHook(() => useTemporaryContentAssets());

    await act(() => result.current.uploadImage(new File(['image'], 'popup.webp', { type: 'image/webp' })));
    await act(() => result.current.discard());

    expect(remove).toHaveBeenCalledWith(asset.assetId);
  });

  it('keeps a referenced upload after a successful save because the API attaches it', async () => {
    const { result } = renderHook(() => useTemporaryContentAssets());

    await act(() => result.current.uploadImage(new File(['image'], 'notice.webp', { type: 'image/webp' })));
    await act(() => result.current.commit({
      type: 'doc',
      content: [{
        type: 'image',
        attrs: { assetId: asset.assetId, src: asset.url, alt: 'Saved image' },
      }],
    }));

    expect(remove).not.toHaveBeenCalled();
  });

  it('keeps referenced images and deletes only the unused subset after save', async () => {
    upload.mockResolvedValueOnce(asset).mockResolvedValueOnce(secondAsset);
    const { result } = renderHook(() => useTemporaryContentAssets());

    await act(() => result.current.uploadImage(new File(['first'], 'first.webp', { type: 'image/webp' })));
    await act(() => result.current.uploadImage(new File(['second'], 'second.png', { type: 'image/png' })));
    await act(() => result.current.commit({
      type: 'doc',
      content: [{
        type: 'image',
        attrs: { assetId: secondAsset.assetId, src: secondAsset.url, alt: 'Second image' },
      }],
    }));

    expect(remove).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith(asset.assetId);
    expect(remove).not.toHaveBeenCalledWith(secondAsset.assetId);
  });

  it('does not track an upload that failed before an asset was returned', async () => {
    upload.mockRejectedValueOnce(new Error('upload failed'));
    const { result } = renderHook(() => useTemporaryContentAssets());

    await act(async () => {
      await expect(result.current.uploadImage(
        new File(['failed'], 'failed.webp', { type: 'image/webp' }),
      )).rejects.toThrow('upload failed');
    });
    await act(() => result.current.discard());

    expect(remove).not.toHaveBeenCalled();
  });

  it('reports cleanup failure and relies on server stale cleanup without repeated deletion', async () => {
    remove.mockRejectedValueOnce(new Error('delete failed'));
    const { result } = renderHook(() => useTemporaryContentAssets());

    await act(() => result.current.uploadImage(new File(['image'], 'popup.webp', { type: 'image/webp' })));
    await act(() => result.current.discard());

    expect(result.current.cleanupError).not.toBe('');
    expect(remove).toHaveBeenCalledTimes(1);

    await act(() => result.current.discard());
    expect(remove).toHaveBeenCalledTimes(1);

    act(() => result.current.clearCleanupError());
    expect(result.current.cleanupError).toBe('');
  });
});
