import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Providers } from './providers';
import { ReleaseVersionWatcher } from '@/components/v1-ui/release-version-watcher';
import { RouteProgressBar } from '@/components/v1-ui/route-progress';
import { publicAssetPath } from '@/lib/assets';
import { getSiteOrigin } from '@/lib/seo';
import './globals.css';
import './desktop/index.css';

export const metadata: Metadata = {
  metadataBase: new URL(getSiteOrigin()),
  applicationName: 'Teameet',
  title: {
    default: 'Teameet',
    template: '%s | Teameet',
  },
  description: '같이 뛸 사람을 한 번에 — AI 기반 멀티스포츠 소셜 매칭 플랫폼',
  category: 'sports',
  formatDetection: { email: false, address: false, telephone: false },
  icons: {
    icon: [
      { url: publicAssetPath('/favicon.png'), type: 'image/png', sizes: '32x32' },
      { url: publicAssetPath('/brand/icon-192.png'), type: 'image/png', sizes: '192x192' },
      { url: publicAssetPath('/brand/icon-512.png'), type: 'image/png', sizes: '512x512' },
    ],
    apple: [{ url: publicAssetPath('/brand/apple-touch-icon.png'), sizes: '180x180' }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="ko">
      <head>
        <link
          rel="preload"
          href={publicAssetPath('/fonts/PretendardVariable.woff2')}
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
      </head>
      <body>
        <RouteProgressBar />
        <ReleaseVersionWatcher />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
