import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'TeamMeet 이용 가이드 - 서비스 이용 방법',
  description:
    'TeamMeet 스포츠 매칭 플랫폼의 상세 이용 가이드. 회원가입부터 매칭, 경기, 평가까지.',
  openGraph: {
    title: 'TeamMeet 이용 가이드 - 서비스 이용 방법',
    description:
      '회원가입부터 AI 매칭, 결제, 경기, 평가까지. TeamMeet 서비스 이용의 모든 것.',
    type: 'website',
  },
};

export default function GuideLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
