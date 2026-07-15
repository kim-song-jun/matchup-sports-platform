import type { MetadataRoute } from 'next';
import { getSiteUrl } from '@/lib/seo';

/**
 * Static sitemap for publicly crawlable pages.
 *
 * Dynamic pages (tournaments/:id, etc.) are intentionally omitted here
 * because they require a live DB fetch. Add a dynamic sitemap route if SEO
 * coverage for dynamic pages becomes a priority.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = getSiteUrl();

  const staticPages: Array<{ path: string; priority?: number; changeFrequency?: MetadataRoute.Sitemap[number]['changeFrequency'] }> = [
    { path: '/', priority: 1.0, changeFrequency: 'daily' },
    { path: '/landing', priority: 0.9, changeFrequency: 'weekly' },
    { path: '/tournaments', priority: 0.8, changeFrequency: 'daily' },
    { path: '/matches', priority: 0.7, changeFrequency: 'hourly' },
    { path: '/teams', priority: 0.6, changeFrequency: 'daily' },
    { path: '/mercenary', priority: 0.6, changeFrequency: 'daily' },
    { path: '/marketplace', priority: 0.5, changeFrequency: 'daily' },
  ];

  return staticPages.map(({ path, priority = 0.5, changeFrequency = 'weekly' }) => ({
    url: `${base}${path}`,
    lastModified: new Date(),
    changeFrequency,
    priority,
  }));
}
