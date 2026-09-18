import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Providers } from './providers';
import { JsonLd } from '@/components/seo/json-ld';
import { PageTransitionController } from '@/components/v1-ui/page-transition-controller';
import { ReleaseVersionWatcher } from '@/components/v1-ui/release-version-watcher';
import { RouteProgressBar } from '@/components/v1-ui/route-progress';
import { ScrollRestoration } from '@/components/v1-ui/scroll-restoration';
import { StaticCacheBootstrap } from '@/components/v1-ui/static-cache-bootstrap';
import { publicAssetPath } from '@/lib/assets';
import { getSiteOrigin } from '@/lib/seo';
import { buildSiteIdentityLd } from '@/lib/structured-data';
import { THEME_INIT_SCRIPT } from '@/lib/theme';
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
    <html lang="ko" suppressHydrationWarning>
      <head>
        <link
          rel="preload"
          href={publicAssetPath('/fonts/PretendardVariable.woff2')}
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        {/* 첫 페인트 전에 .dark 클래스를 동기 적용해 FOUC(테마 깜빡임)를 막는다.
            상수 문자열만 담으므로(외부 입력 없음) XSS 위험이 없다 — src/lib/theme.ts 참고. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        {/* Organization·WebSite 엔티티는 사이트 전체에서 여기 한 번만 선언한다 —
            페이지마다 다시 선언하면 같은 실체가 검색엔진 안에서 쪼개진다. 개별 페이지의
            구조화 데이터는 @id로 이 선언을 참조한다(src/lib/structured-data.ts 참고). */}
        <JsonLd data={buildSiteIdentityLd()} />
      </head>
      <body>
        <RouteProgressBar />
        <PageTransitionController />
        <ReleaseVersionWatcher />
        <ScrollRestoration />
        <StaticCacheBootstrap />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
