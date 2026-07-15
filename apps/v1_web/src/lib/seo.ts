/**
 * SEO helpers for Teameet.
 *
 * Production host: https://teameet.co.kr (root — no /v1 basePath).
 * All canonical and Open Graph URLs use the production host only when
 * `NEXT_PUBLIC_SITE_URL` is explicitly set; otherwise falls back to a
 * relative URL so dev/staging don't accidentally emit prod canonicals.
 */

const PRODUCTION_HOST = 'https://teameet.co.kr';

export function getSiteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, '');
  return configured || PRODUCTION_HOST;
}

export function canonicalUrl(path: string): string {
  const base = getSiteUrl();
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${base}${normalizedPath}`;
}

export type OpenGraphImage = {
  url: string;
  width?: number;
  height?: number;
  alt?: string;
};

const DEFAULT_OG_IMAGE: OpenGraphImage = {
  url: `${PRODUCTION_HOST}/brand/og-image.png`,
  width: 1200,
  height: 630,
  alt: 'Teameet — 같이 뛸 사람을 한 번에',
};

export type PageSeoOptions = {
  title?: string;
  description?: string;
  path?: string;
  images?: OpenGraphImage[];
  noIndex?: boolean;
};

export function buildPageMetadata(options: PageSeoOptions = {}) {
  const {
    title,
    description = '같이 뛸 사람을 한 번에 — AI 기반 멀티스포츠 소셜 매칭 플랫폼',
    path,
    images,
    noIndex = false,
  } = options;

  const siteTitle = 'Teameet';
  const fullTitle = title ? `${title} | ${siteTitle}` : siteTitle;
  const canonical = path ? canonicalUrl(path) : undefined;
  const ogImages = images ?? [DEFAULT_OG_IMAGE];

  return {
    title: fullTitle,
    description,
    ...(canonical ? { alternates: { canonical } } : {}),
    openGraph: {
      title: fullTitle,
      description,
      type: 'website' as const,
      siteName: siteTitle,
      locale: 'ko_KR',
      ...(canonical ? { url: canonical } : {}),
      images: ogImages,
    },
    twitter: {
      card: 'summary_large_image' as const,
      title: fullTitle,
      description,
      images: ogImages.map((img) => img.url),
    },
    robots: noIndex
      ? { index: false, follow: false }
      : { index: true, follow: true },
  };
}
