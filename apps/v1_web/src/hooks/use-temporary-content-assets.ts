'use client';

import { useCallback, useRef, useState } from 'react';
import { useV1DeleteAdminContentAsset, useV1UploadAdminContentAsset } from '@/hooks/use-v1-api';
import { extractErrorMessage } from '@/lib/error-message';
import type { V1AdminContentAsset, V1RichContentDocument, V1RichContentNode } from '@/types/api';

export function useTemporaryContentAssets() {
  const uploadAsset = useV1UploadAdminContentAsset();
  const deleteAsset = useV1DeleteAdminContentAsset();
  const temporaryIds = useRef(new Set<string>());
  const [cleanupError, setCleanupError] = useState('');

  const uploadImage = useCallback(async (file: File): Promise<V1AdminContentAsset> => {
    const asset = await uploadAsset.mutateAsync(file);
    temporaryIds.current.add(asset.assetId);
    return asset;
  }, [uploadAsset]);

  const deleteTemporaryIds = useCallback(async (assetIds: string[]) => {
    if (!assetIds.length) return true;
    const results = await Promise.allSettled(assetIds.map((assetId) => deleteAsset.mutateAsync(assetId)));
    const failed = results.filter((result) => result.status === 'rejected');
    if (failed.length) {
      const reason = failed[0].status === 'rejected' ? failed[0].reason : undefined;
      setCleanupError(extractErrorMessage(reason, '임시 이미지를 정리하지 못했어요. 서버에서 자동으로 다시 정리합니다.'));
      return false;
    }
    return true;
  }, [deleteAsset]);

  const discard = useCallback(async () => {
    const assetIds = [...temporaryIds.current];
    temporaryIds.current.clear();
    return deleteTemporaryIds(assetIds);
  }, [deleteTemporaryIds]);

  const commit = useCallback(async (document: V1RichContentDocument) => {
    const referenced = collectImageAssetIds(document);
    const unused = [...temporaryIds.current].filter((assetId) => !referenced.has(assetId));
    temporaryIds.current.clear();
    return deleteTemporaryIds(unused);
  }, [deleteTemporaryIds]);

  return {
    uploadImage,
    discard,
    commit,
    cleanupError,
    clearCleanupError: () => setCleanupError(''),
    isUploading: uploadAsset.isPending,
    isCleaning: deleteAsset.isPending,
  };
}

function collectImageAssetIds(document: V1RichContentDocument) {
  const assetIds = new Set<string>();
  const visit = (node: V1RichContentNode) => {
    if (node.type === 'image' && node.attrs?.assetId) assetIds.add(node.attrs.assetId);
    node.content?.forEach(visit);
  };
  visit(document);
  return assetIds;
}
