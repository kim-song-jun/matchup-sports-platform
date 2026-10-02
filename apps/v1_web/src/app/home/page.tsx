import type { Metadata } from 'next';
import { HomePageClient } from '@/components/home/home-client';

// 로그인 사용자의 앱 홈이라 첫 HTML 은 "불러오는 중"뿐이다. 브랜드 검색은 /landing 이 받는다.
export const metadata: Metadata = {
  title: '홈',
  robots: { index: false, follow: true },
};

export default function HomePage() {
  return <HomePageClient />;
}
