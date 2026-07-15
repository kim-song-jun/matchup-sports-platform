import type { MetadataRoute } from 'next';
import { getSiteUrl } from '@/lib/seo';

export default function robots(): MetadataRoute.Robots {
  const siteUrl = getSiteUrl();
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // 관리자·인증·개인 경로는 크롤링하지 않습니다.
        disallow: ['/admin/', '/my/', '/login', '/signup', '/onboarding', '/callback/'],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
