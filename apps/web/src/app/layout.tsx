import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Providers } from './providers';
import { ProgressBar } from '@/components/layout/progress-bar';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getLocale } from 'next-intl/server';

export const metadata: Metadata = {
  title: {
    default: 'TeamMeet — AI 스포츠 매칭 플랫폼',
    template: '%s | TeamMeet',
  },
  description: '풋살, 농구, 배드민턴, 테니스 등 생활체육을 AI로 매칭합니다. 실력에 맞는 상대를 찾고, 팀 매칭부터 레슨·수강권까지 한 곳에서.',
  manifest: '/manifest.json',
  keywords: ['스포츠 매칭', '풋살', '농구', '배드민턴', '테니스', '생활체육', '운동 파트너', '팀 매칭', 'AI 매칭'],
  authors: [{ name: 'TeamMeet' }],
  openGraph: {
    type: 'website',
    locale: 'ko_KR',
    siteName: 'TeamMeet',
    title: 'TeamMeet — AI 스포츠 매칭 플랫폼',
    description: '실력에 맞는 스포츠 파트너를 AI로 매칭합니다. 풋살, 농구, 배드민턴, 테니스 등.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'TeamMeet — AI 스포츠 매칭 플랫폼',
    description: '실력에 맞는 스포츠 파트너를 AI로 매칭합니다.',
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#3182F6',
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme')||'light';var d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme:dark)').matches);if(d){document.documentElement.classList.add('dark');document.documentElement.style.colorScheme='dark'}}catch(e){}})()`,
          }}
        />
        <link
          rel="preload"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
          as="style"
        />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body className="min-h-dvh bg-background">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[100] focus:px-4 focus:py-2 focus:bg-blue-500 focus:text-white focus:rounded-lg focus:outline-none"
        >
          본문으로 건너뛰기
        </a>
        <NextIntlClientProvider messages={messages}>
          <ProgressBar />
          <Providers>{children}</Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
