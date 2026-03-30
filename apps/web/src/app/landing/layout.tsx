import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'MatchUp - 신뢰 기반 스포츠 매칭 플랫폼 | 실력과 매너로 연결되는 경기',
  description: '실력, 활동 지역, 매너 데이터를 바탕으로 믿을 수 있는 스포츠 상대를 연결합니다. 개인 매치, 팀 매칭, 프로필 관리까지 한 곳에서.',
  openGraph: {
    title: 'MatchUp - 실력과 매너로 연결되는 스포츠 매칭',
    description: '매칭, 신뢰, 프로필을 중심으로 설계된 스포츠 매칭 플랫폼.',
    type: 'website',
  },
};

export default function LandingLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
