import type { Metadata } from 'next';
import type { ApiEnvelope } from '@/types/api';

const DEFAULT_SITE_ORIGIN = 'https://teameet.co.kr';
/**
 * 커버가 없는 페이지의 링크 미리보기. `app/opengraph-image.tsx` 가 이 경로·크기로 그린다.
 * 카카오톡·페이스북·X 의 큰 카드 규격(1.91:1)이라 정사각 앱 아이콘처럼 잘리지 않는다.
 */
export const DEFAULT_SOCIAL_IMAGE = { path: '/opengraph-image', width: 1200, height: 630 } as const;

type PublicMetadataInput = {
  title: string;
  description: string;
  path: string;
  image?: string | null;
  /** 정사각 이미지(팀 로고 등). X 의 큰 카드는 1.91:1 로 잘라 위아래가 잘리므로 작은 카드로 보낸다. */
  squareImage?: boolean;
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
  squareImage = false,
  type = 'website',
}: PublicMetadataInput): Metadata {
  const socialTitle = `${title} | Teameet`;
  const imageUrl = image || DEFAULT_SOCIAL_IMAGE.path;
  // 크기를 아는 건 기본 이미지뿐이다 — 업로드 커버는 비율이 제각각이라 추측해 적지 않는다.
  const ogImage = image
    ? { url: image, alt: title }
    : { url: DEFAULT_SOCIAL_IMAGE.path, width: DEFAULT_SOCIAL_IMAGE.width, height: DEFAULT_SOCIAL_IMAGE.height, alt: title };

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
      images: [ogImage],
    },
    twitter: {
      card: image && squareImage ? 'summary' : 'summary_large_image',
      title: socialTitle,
      description,
      images: [imageUrl],
    },
  };
}

/**
 * 팀 목록·상세의 메타 설명 폴백 문구.
 *
 * 종목·지역은 둘 다 없을 수 있는데(마스터 미연결 팀 등), 템플릿에 그대로 끼우면
 * "undefined · null에서 활동하는 …" 이 검색 결과에 그대로 노출된다. 있는 조각만 조합한다.
 */
export function teamDescriptionFallback(
  teamName: string,
  sportName?: string | null,
  regionName?: string | null,
): string {
  const sport = sportName?.trim();
  const region = regionName?.trim();
  if (sport && region) return `${sport} · ${region}에서 활동하는 ${teamName} 팀을 만나보세요.`;
  if (region) return `${region}에서 활동하는 ${teamName} 팀을 만나보세요.`;
  if (sport) return `${sport}을 함께할 ${teamName} 팀을 만나보세요.`;
  return `${teamName} 팀을 만나보세요.`;
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
