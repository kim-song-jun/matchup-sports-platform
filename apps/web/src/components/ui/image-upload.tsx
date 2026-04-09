'use client';

import { useId, useRef, useState } from 'react';
import { Image as ImageIcon, X, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useToast } from '@/components/ui/toast';

interface UploadRecord {
  id: string;
  path: string;
  width?: number;
  height?: number;
}

// api.ts interceptor returns response.data directly, which for our API is
// the TransformInterceptor-wrapped { status, data, timestamp } object.
interface ApiResponse<T> {
  status: string;
  data: T;
  timestamp: string;
}

export interface ImageUploadProps {
  value: string[];
  onChange: (urls: string[]) => void;
  max?: number;
  accept?: string;
  maxSizeMB?: number;
  label?: string;
  disabled?: boolean;
}

export function ImageUpload({
  value,
  onChange,
  max = 5,
  accept = 'image/jpeg,image/png,image/webp',
  maxSizeMB = 10,
  label,
  disabled = false,
}: ImageUploadProps) {
  // task 19 fix: use stable React id (was Math.random causing hydration drift)
  const inputId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const { toast } = useToast();

  const allowedMimes = accept.split(',').map((s) => s.trim());

  function validateFiles(files: File[]): string | null {
    for (const file of files) {
      if (!allowedMimes.includes(file.type)) {
        return 'JPG, PNG, WebP 형식의 이미지만 업로드할 수 있어요';
      }
      if (file.size > maxSizeMB * 1024 * 1024) {
        return `${maxSizeMB}MB 이하의 파일만 업로드할 수 있어요`;
      }
    }
    return null;
  }

  async function handleFiles(files: File[]) {
    if (files.length === 0) return;

    if (value.length + files.length > max) {
      toast('error', `최대 ${max}장까지 가능해요`);
      return;
    }

    const validationError = validateFiles(files);
    if (validationError) {
      toast('error', validationError);
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      for (const file of files) {
        formData.append('files', file);
      }

      // task 19 fix: do NOT set Content-Type manually for FormData — the browser
      // must auto-generate the multipart boundary, otherwise multer cannot parse it.
      const result = await api.post<unknown, ApiResponse<UploadRecord[]>>('/uploads', formData);

      // api.ts interceptor unwraps to response.data (TransformInterceptor envelope).
      const records = result && typeof result === 'object' && 'data' in result
        ? (result as ApiResponse<UploadRecord[]>).data
        : [];
      const urls = Array.isArray(records) ? records.map((r) => r.path) : [];
      onChange([...value, ...urls]);
    } catch {
      toast('error', '업로드에 실패했어요. 잠시 후 다시 시도해주세요');
    } finally {
      setUploading(false);
      // Reset input so the same file can be re-selected if needed
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    handleFiles(files);
  }

  function handleRemove(index: number) {
    onChange(value.filter((_, i) => i !== index));
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    if (disabled || uploading) return;
    const files = Array.from(e.dataTransfer.files);
    handleFiles(files);
  }

  const canAdd = !disabled && !uploading && value.length < max;

  return (
    <div>
      {label && (
        <label
          htmlFor={inputId}
          className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5"
        >
          {label}
        </label>
      )}

      <div
        role="region"
        aria-label={label || '이미지 업로드'}
        aria-busy={uploading}
        className="flex flex-wrap gap-2"
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
      >
        {/* Uploaded image thumbnails */}
        {value.map((url, i) => (
          <div
            key={`${url}-${i}`}
            className="relative h-20 w-20 shrink-0 rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-700 animate-fade-in"
          >
            <img
              src={url}
              alt={`업로드된 이미지 ${i + 1}`}
              className="h-full w-full object-cover"
              loading="lazy"
            />
            {/* task 19 fix: visible 24x24 chip with a 44x44 invisible hit area via ::before */}
            <button
              type="button"
              onClick={() => handleRemove(i)}
              disabled={disabled || uploading}
              aria-label={`이미지 ${i + 1} 제거`}
              className="absolute top-1 right-1 flex h-6 w-6 items-center justify-center rounded-full bg-gray-900/75 text-white transition-colors hover:bg-gray-900 focus:outline-2 focus:outline-blue-500 focus:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50 before:absolute before:-inset-2.5 before:content-['']"
            >
              <X size={14} aria-hidden="true" />
            </button>
          </div>
        ))}

        {/* Upload trigger area */}
        {canAdd && (
          <label
            htmlFor={inputId}
            className="flex h-20 w-20 shrink-0 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-600 text-gray-400 dark:text-gray-500 transition-colors hover:border-blue-400 hover:bg-blue-50 dark:hover:border-blue-600 dark:hover:bg-blue-950/20 focus-within:outline-2 focus-within:outline-blue-500 focus-within:outline-offset-2"
            aria-label={`이미지 추가 (${value.length}/${max})`}
          >
            <ImageIcon size={18} aria-hidden="true" />
            <span className="text-2xs">{value.length}/{max}</span>
          </label>
        )}

        {/* Upload spinner */}
        {uploading && (
          <div
            role="status"
            aria-live="polite"
            className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl bg-gray-50 dark:bg-gray-800"
          >
            <Loader2 size={20} className="animate-spin text-blue-500" aria-hidden="true" />
            <span className="sr-only">업로드 중...</span>
          </div>
        )}
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        id={inputId}
        type="file"
        accept={accept}
        multiple={max > 1}
        disabled={disabled || uploading || value.length >= max}
        onChange={handleInputChange}
        className="sr-only"
        aria-label={label || '이미지 파일 선택'}
      />
    </div>
  );
}
