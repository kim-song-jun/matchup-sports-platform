import type { Metadata } from 'next';
import type { ApiEnvelope } from '@/types/api';

const DEFAULT_SITE_ORIGIN = 'https://teameet.co.kr';
const DEFAULT_SOCIAL_IMAGE = '/brand/icon-512.png';

type PublicMetadataInput = {
  title: string;
  description: string;
  path: string;
  image?: string | null;
  type?: 'website' | 'article';
};

export function getSiteOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!configured) return DEFAULT_SITE_ORIGIN;

  try {
    const parsed = new URL(configured);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return DEFAULT_SITE_ORIGIN;
    if (process.env.NODE_ENV === 'production' && parsed.protocol !== 'https:') {
      return DEFAULT_SITE_ORIGIN;
    }
    return parsed.origin;
  } catch {
    return DEFAULT_SITE_ORIGIN;
  }
}

export function absoluteSiteUrl(pathname: string): string {
  return new URL(pathname, `${getSiteOrigin()}/`).toString();
}

export function buildPublicMetadata({
  title,
  description,
  path,
  image,
  type = 'website',
}: PublicMetadataInput): Metadata {
  const socialTitle = `${title} | Teameet`;
  const imageUrl = image || DEFAULT_SOCIAL_IMAGE;

  return {
    title,
    description,
    alternates: { canonical: path },
    robots: { index: true, follow: true },
    openGraph: {
      type,
      locale: 'ko_KR',
      siteName: 'Teameet',
      title: socialTitle,
      description,
      url: path,
      images: [{ url: imageUrl, alt: title }],
    },
    twitter: {
      card: 'summary',
      title: socialTitle,
      description,
      images: [imageUrl],
    },
  };
}

export function buildNoIndexMetadata(title: string, description?: string): Metadata {
  return {
    title,
    ...(description ? { description } : {}),
    robots: { index: false, follow: false, nocache: true },
  };
}

export function metadataDescription(value: string | null | undefined, fallback: string): string {
  const normalized = value?.replace(/\s+/g, ' ').trim();
  if (!normalized) return fallback;
  return normalized.length > 155 ? `${normalized.slice(0, 152).trimEnd()}…` : normalized;
}

export async function fetchPublicV1<T>(path: string): Promise<T | null> {
  const response = await fetch(`${getInternalApiOrigin()}/api/v1${path}`, {
    headers: { accept: 'application/json' },
    next: { revalidate: 300 },
  });

  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`SEO metadata request failed: ${path} (${response.status})`);

  const envelope = (await response.json()) as ApiEnvelope<T>;
  return envelope.data;
}

function getInternalApiOrigin(): string {
  const configured = process.env.INTERNAL_API_ORIGIN
    ?? process.env.NEXT_PUBLIC_API_URL?.replace(/\/api\/v1\/?$/, '');
  if (configured) return configured.replace(/\/$/, '');
  return process.env.NODE_ENV === 'production' ? 'http://v1_api:8121' : 'http://localhost:8121';
}
