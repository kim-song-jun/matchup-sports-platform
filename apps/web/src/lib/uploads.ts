'use client';

import { api } from '@/lib/api';
import type { ApiResponse, Upload } from '@/types/api';

export type UploadAssetSource = 'existing' | 'uploaded';

export interface UploadAsset {
  id?: string;
  url: string;
  thumbUrl?: string;
  source: UploadAssetSource;
}

type UploadApiRecord = Upload & {
  thumbPath?: string;
};

function isUploadEnvelope(value: unknown): value is ApiResponse<UploadApiRecord[]> {
  return value !== null && typeof value === 'object' && 'data' in value;
}

export function normalizeUploadAssetUrl(url?: string | null): string | null {
  if (!url || url.includes('..')) return null;
  if (
    url.startsWith('/') ||
    url.startsWith('http://') ||
    url.startsWith('https://') ||
    url.startsWith('data:image/')
  ) {
    return url;
  }
  return `/${url}`;
}

export function toExistingUploadAsset(url: string): UploadAsset {
  return {
    url,
    source: 'existing',
  };
}

export function toUploadAsset(record: UploadApiRecord): UploadAsset {
  return {
    id: record.id,
    url: record.path,
    thumbUrl: record.thumbPath,
    source: 'uploaded',
  };
}

export function extractUploadUrls(assets: UploadAsset[]): string[] {
  return assets.map((asset) => asset.url);
}

export function firstUploadUrl(assets: UploadAsset[]): string | undefined {
  return assets[0]?.url;
}

export async function uploadFiles(files: File[]): Promise<UploadAsset[]> {
  const formData = new FormData();
  files.forEach((file) => formData.append('files', file));

  const response = await api.post<ApiResponse<UploadApiRecord[]>>('/uploads', formData);
  const records = isUploadEnvelope(response) ? response.data : [];
  return records.map(toUploadAsset);
}

export async function deleteUpload(uploadId: string): Promise<void> {
  await api.delete(`/uploads/${uploadId}`);
}
