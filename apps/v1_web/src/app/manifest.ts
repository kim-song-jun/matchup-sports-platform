import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Teameet',
    short_name: 'Teameet',
    description: '같이 뛸 사람을 한 번에 — AI 기반 멀티스포츠 소셜 매칭 플랫폼',
    start_url: '/home',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#3182F6',
    orientation: 'portrait',
    icons: [
      {
        src: '/brand/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/brand/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/brand/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
