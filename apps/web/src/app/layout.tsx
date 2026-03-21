import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Providers } from './providers';
import { ProgressBar } from '@/components/layout/progress-bar';

export const metadata: Metadata = {
  title: 'MatchUp - 스포츠 매칭 플랫폼',
  description: 'AI 기반 멀티스포츠 소셜 매칭 플랫폼',
  manifest: '/manifest.json',
};

export const dynamic = 'force-dynamic';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#3182F6',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body className="min-h-dvh bg-background">
        <ProgressBar />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
