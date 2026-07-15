import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Providers } from './providers';
import { RouteProgressBar } from '@/components/v1-ui/route-progress';
import { publicAssetPath } from '@/lib/assets';
import { buildPageMetadata } from '@/lib/seo';
import './globals.css';
import './desktop/index.css';

const seoBase = buildPageMetadata({ path: '/' });

export const metadata: Metadata = {
  ...seoBase,
  title: {
    default: 'Teameet',
    template: '%s | Teameet',
  },
  icons: {
    icon: [
      { url: publicAssetPath('/favicon.png'), type: 'image/png', sizes: '32x32' },
      { url: publicAssetPath('/brand/icon-192.png'), type: 'image/png', sizes: '192x192' },
      { url: publicAssetPath('/brand/icon-512.png'), type: 'image/png', sizes: '512x512' },
    ],
    apple: [{ url: publicAssetPath('/brand/apple-touch-icon.png'), sizes: '180x180' }],
  },
  manifest: '/manifest.webmanifest',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>
        <RouteProgressBar />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
