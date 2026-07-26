import type { MetadataRoute } from 'next';
import { absoluteSiteUrl, getSiteOrigin } from '@/lib/seo';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: [
          '/landing',
          '/matches',
          '/teams',
          '/team-matches',
          '/tournaments',
          '/events',
          '/notices',
        ],
        disallow: [
          '/api/',
          '/admin/',
          '/auth/',
          '/callback/',
          '/chat/',
          '/home',
          '/login',
          '/my/',
          '/notifications',
          '/onboarding/',
          '/search',
          '/signup',
          '/users/',
          '/*/edit',
          '/*/new',
          '/*/apply',
          '/*/applications',
        ],
      },
    ],
    sitemap: absoluteSiteUrl('/sitemap.xml'),
    host: getSiteOrigin(),
  };
}
