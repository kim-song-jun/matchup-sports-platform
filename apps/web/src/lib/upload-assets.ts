export interface UploadAsset {
  id?: string;
  url: string;
  thumbUrl?: string;
}

export function createExistingUploadAsset(url?: string | null): UploadAsset[] {
  return url ? [{ url }] : [];
}

export function createExistingUploadAssets(
  urls?: Array<string | null | undefined>,
): UploadAsset[] {
  return (urls ?? [])
    .filter((url): url is string => Boolean(url))
    .map((url) => ({ url }));
}

export function getUploadAssetUrls(assets: UploadAsset[]): string[] {
  return assets
    .map((asset) => asset.url)
    .filter((url): url is string => Boolean(url));
}

export function getPrimaryUploadAssetUrl(assets: UploadAsset[]): string | undefined {
  return getUploadAssetUrls(assets)[0];
}
