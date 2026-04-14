import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Teameet - AI 스포츠 매칭 플랫폼 | 내 수준에 맞는 운동 메이트',
  description: '축구, 풋살, 농구, 배드민턴 등 11개 종목. 실력·위치·매너를 AI가 분석해 딱 맞는 상대를 매칭해드려요. 가입 3초, 첫 매칭 무료.',
  openGraph: {
    title: 'Teameet - 내 수준에 딱 맞는 운동 메이트, AI가 찾아드려요',
    description: '실력 기반 스포츠 매칭 플랫폼. 11개 종목 지원, 2,400+ 매칭 완료.',
    type: 'website',
  },
};

export default function LandingLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
