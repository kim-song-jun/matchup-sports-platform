'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { ImagePlus, Loader2, RotateCcw, X } from 'lucide-react';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import {
  deleteUpload,
  normalizeUploadAssetUrl,
  uploadFiles,
  type UploadAsset,
} from '@/lib/uploads';

interface PendingUploadItem {
  localId: string;
  file: File;
  previewUrl: string;
  status: 'queued' | 'uploading' | 'error';
  errorMessage?: string;
}

export interface ImageUploadState {
  hasPendingUploads: boolean;
  hasUploadErrors: boolean;
  pendingCount: number;
}

export interface ImageUploadProps {
  value: UploadAsset[];
  onChange: (assets: UploadAsset[]) => void;
  onStateChange?: (state: ImageUploadState) => void;
  max?: number;
  accept?: string;
  maxSizeMB?: number;
  label?: string;
  disabled?: boolean;
}

function makeLocalId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function revokePreviewUrl(previewUrl: string) {
  if (previewUrl.startsWith('blob:')) {
    URL.revokeObjectURL(previewUrl);
  }
}

function getAssetKey(asset: UploadAsset) {
  return asset.id ? `upload-${asset.id}` : `asset-${asset.source}-${asset.url}`;
}

function isSameAsset(left: UploadAsset, right: UploadAsset) {
  if (left.id && right.id) return left.id === right.id;
  return left.url === right.url && left.source === right.source;
}

export function ImageUpload({
  value,
  onChange,
  onStateChange,
  max = 5,
  accept = 'image/jpeg,image/png,image/webp,image/gif',
  maxSizeMB = 10,
  label,
  disabled = false,
}: ImageUploadProps) {
  const inputId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const assetsRef = useRef(value);
  const pendingRef = useRef<PendingUploadItem[]>([]);
  const [pendingItems, setPendingItems] = useState<PendingUploadItem[]>([]);
  const [deletingKeys, setDeletingKeys] = useState<string[]>([]);
  const { toast } = useToast();

  useEffect(() => {
    assetsRef.current = value;
  }, [value]);

  useEffect(() => {
    pendingRef.current = pendingItems;
  }, [pendingItems]);

  const hasPendingUploads = pendingItems.some((item) => item.status !== 'error');
  const hasUploadErrors = pendingItems.some((item) => item.status === 'error');

  useEffect(() => {
    onStateChange?.({
      hasPendingUploads,
      hasUploadErrors,
      pendingCount: pendingItems.length,
    });
  }, [hasPendingUploads, hasUploadErrors, onStateChange, pendingItems.length]);

  useEffect(
    () => () => {
      pendingRef.current.forEach((item) => revokePreviewUrl(item.previewUrl));
    },
    [],
  );

  const allowedMimes = accept.split(',').map((mime) => mime.trim());
  const totalCount = value.length + pendingItems.length;
  const canAdd = !disabled && totalCount < max;

  function commitAssets(nextAssets: UploadAsset[]) {
    assetsRef.current = nextAssets;
    onChange(nextAssets);
  }

  function updatePendingItem(localId: string, updater: (item: PendingUploadItem) => PendingUploadItem) {
    setPendingItems((prev) => prev.map((item) => (item.localId === localId ? updater(item) : item)));
  }

  function removePendingItem(localId: string) {
    setPendingItems((prev) => {
      const target = prev.find((item) => item.localId === localId);
      if (target) {
        revokePreviewUrl(target.previewUrl);
      }
      return prev.filter((item) => item.localId !== localId);
    });
  }

  function validateFiles(files: File[]): string | null {
    for (const file of files) {
      if (!allowedMimes.includes(file.type)) {
        return 'JPG, PNG, WebP, GIF 형식의 이미지만 업로드할 수 있어요';
      }
      if (file.size > maxSizeMB * 1024 * 1024) {
        return `${maxSizeMB}MB 이하의 파일만 업로드할 수 있어요`;
      }
    }
    return null;
  }

  async function uploadPendingItem(item: PendingUploadItem) {
    updatePendingItem(item.localId, (current) => ({
      ...current,
      status: 'uploading',
      errorMessage: undefined,
    }));

    try {
      const [asset] = await uploadFiles([item.file]);
      if (!asset) {
        throw new Error('missing upload asset');
      }

      removePendingItem(item.localId);
      commitAssets([...assetsRef.current, asset]);
    } catch {
      updatePendingItem(item.localId, (current) => ({
        ...current,
        status: 'error',
        errorMessage: '업로드에 실패했어요',
      }));
      toast('error', '업로드에 실패했어요. 다시 시도해주세요');
    }
  }

  async function handleFiles(files: File[]) {
    if (files.length === 0) return;

    if (assetsRef.current.length + pendingRef.current.length + files.length > max) {
      toast('error', `최대 ${max}장까지 가능해요`);
      return;
    }

    const validationError = validateFiles(files);
    if (validationError) {
      toast('error', validationError);
      return;
    }

    const nextPendingItems = files.map<PendingUploadItem>((file) => ({
      localId: makeLocalId(),
      file,
      previewUrl: URL.createObjectURL(file),
      status: 'queued',
    }));

    setPendingItems((prev) => [...prev, ...nextPendingItems]);

    for (const item of nextPendingItems) {
      await uploadPendingItem(item);
    }
  }

  function handleInputChange(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []);
    void handleFiles(files);

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    if (disabled) return;
    void handleFiles(Array.from(event.dataTransfer.files));
  }

  function handleRetry(localId: string) {
    const target = pendingRef.current.find((item) => item.localId === localId);
    if (!target) return;
    void uploadPendingItem(target);
  }

  async function handleRemoveAsset(asset: UploadAsset) {
    if (disabled) return;

    if (asset.source === 'uploaded' && asset.id) {
      const assetKey = getAssetKey(asset);
      setDeletingKeys((prev) => [...prev, assetKey]);

      try {
        await deleteUpload(asset.id);
        commitAssets(assetsRef.current.filter((candidate) => !isSameAsset(candidate, asset)));
      } catch {
        toast('error', '이미지를 제거하지 못했어요. 다시 시도해주세요');
      } finally {
        setDeletingKeys((prev) => prev.filter((key) => key !== assetKey));
      }

      return;
    }

    commitAssets(assetsRef.current.filter((candidate) => !isSameAsset(candidate, asset)));
  }

  return (
    <div className="space-y-2.5">
      {label && (
        <label
          htmlFor={inputId}
          className="block text-xs font-semibold text-gray-500 dark:text-gray-400"
        >
          {label}
        </label>
      )}

      <div
        role="region"
        aria-label={label || '이미지 업로드'}
        aria-busy={hasPendingUploads || deletingKeys.length > 0}
        onDrop={handleDrop}
        onDragOver={(event) => event.preventDefault()}
        className="flex flex-wrap gap-3"
      >
        {value.map((asset, index) => {
          const deleting = deletingKeys.includes(getAssetKey(asset));
          const src = normalizeUploadAssetUrl(asset.thumbUrl ?? asset.url);

          return (
            <div
              key={`${getAssetKey(asset)}-${index}`}
              className="relative h-24 w-24 shrink-0 overflow-hidden rounded-2xl border border-gray-200 bg-gray-100 animate-fade-in dark:border-gray-700 dark:bg-gray-800"
            >
              {src ? (
                <img
                  src={src}
                  alt={`업로드된 이미지 ${index + 1}`}
                  className={cn('h-full w-full object-cover', deleting && 'opacity-40')}
                  loading="lazy"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-gray-400 dark:text-gray-500">
                  <ImagePlus size={20} aria-hidden="true" />
                </div>
              )}

              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-gray-950/75 to-transparent px-2 py-1.5">
                <span className="block text-2xs font-medium text-white">
                  {deleting ? '제거 중' : asset.source === 'existing' ? '기존 이미지' : '업로드 완료'}
                </span>
              </div>

              <button
                type="button"
                onClick={() => {
                  void handleRemoveAsset(asset);
                }}
                disabled={disabled || deleting}
                aria-label={`이미지 ${index + 1} 제거`}
                className="absolute right-1 top-1 flex min-h-11 min-w-11 items-start justify-end rounded-xl p-1.5 text-white focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-900/80 transition-colors hover:bg-gray-900">
                  <X size={14} aria-hidden="true" />
                </span>
              </button>
            </div>
          );
        })}

        {pendingItems.map((item, index) => {
          const uploading = item.status === 'uploading';
          const queued = item.status === 'queued';

          return (
            <div
              key={item.localId}
              className="relative h-24 w-24 shrink-0 overflow-hidden rounded-2xl border border-gray-200 bg-gray-100 animate-fade-in dark:border-gray-700 dark:bg-gray-800"
            >
              <img
                src={item.previewUrl}
                alt={`선택한 이미지 ${index + 1}`}
                className={cn('h-full w-full object-cover', item.status === 'error' && 'opacity-40')}
                loading="lazy"
              />

              <div className="absolute inset-0 bg-gray-950/45" />

              {uploading || queued ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-white">
                  <Loader2 size={18} className={cn(uploading && 'animate-spin')} aria-hidden="true" />
                  <span className="text-2xs font-medium">{uploading ? '업로드 중' : '대기 중'}</span>
                </div>
              ) : (
                <>
                  <div className="absolute inset-x-0 top-2 px-2 text-center">
                    <span className="rounded-full bg-red-500/90 px-2 py-0.5 text-2xs font-semibold text-white">
                      실패
                    </span>
                  </div>
                  <div className="absolute inset-x-0 bottom-2 flex items-center justify-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleRetry(item.localId)}
                      aria-label="업로드 재시도"
                      className="flex min-h-11 min-w-11 items-center justify-center rounded-xl bg-white/90 text-gray-900 transition-colors hover:bg-white focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
                    >
                      <RotateCcw size={14} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => removePendingItem(item.localId)}
                      aria-label="실패한 이미지 제거"
                      className="flex min-h-11 min-w-11 items-center justify-center rounded-xl bg-gray-900/80 text-white transition-colors hover:bg-gray-900 focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
                    >
                      <X size={14} aria-hidden="true" />
                    </button>
                  </div>
                </>
              )}
            </div>
          );
        })}

        {canAdd && (
          <label
            htmlFor={inputId}
            className={cn(
              'cursor-pointer rounded-2xl border border-dashed border-gray-200 text-center text-gray-500 transition-colors hover:border-blue-400 hover:bg-blue-50/70 hover:text-blue-500 focus-within:outline-2 focus-within:outline-blue-500 focus-within:outline-offset-2 dark:border-gray-700 dark:text-gray-400 dark:hover:border-blue-500 dark:hover:bg-blue-950/20 dark:hover:text-blue-300',
              totalCount === 0
                ? 'flex min-h-[120px] w-full flex-col items-center justify-center gap-2 px-4 py-5'
                : 'flex h-24 w-24 shrink-0 flex-col items-center justify-center gap-1',
            )}
            aria-label={`이미지 추가 (${totalCount}/${max})`}
          >
            <ImagePlus size={20} aria-hidden="true" />
            <div className="space-y-0.5">
              <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                {totalCount === 0 ? '이미지 업로드' : `${totalCount}/${max}`}
              </p>
              <p className="text-2xs text-gray-500 dark:text-gray-400">
                {totalCount === 0 ? `최대 ${max}장, ${maxSizeMB}MB 이하` : '추가'}
              </p>
            </div>
          </label>
        )}
      </div>

      <p className="text-xs text-gray-500 dark:text-gray-400">
        업로드한 이미지만 저장되며, 예시 이미지는 제출 payload에 포함되지 않아요.
      </p>

      <input
        ref={fileInputRef}
        id={inputId}
        type="file"
        accept={accept}
        multiple={max > 1}
        disabled={disabled || !canAdd}
        onChange={handleInputChange}
        className="sr-only"
        aria-label={label || '이미지 파일 선택'}
      />
    </div>
  );
}
