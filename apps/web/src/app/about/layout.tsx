import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'MatchUp 소개 - 신뢰 기반 스포츠 매칭 플랫폼',
  description:
    'MatchUp의 비전과 미션. 모든 사람이 자기 수준에 맞는 운동 상대를 쉽게 찾을 수 있는 세상을 만듭니다.',
  openGraph: {
    title: 'MatchUp 소개 - 신뢰 기반 스포츠 매칭 플랫폼',
    description:
      '모든 사람이 자기 수준에 맞는 운동 상대를 쉽게 찾을 수 있는 세상을 만듭니다.',
    type: 'website',
  },
};

export default function AboutLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
