import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '자주 묻는 질문',
  description: 'TeamMeet 서비스, AI 매칭, 결제, 계정 관련 자주 묻는 질문과 답변을 확인하세요.',
  openGraph: {
    title: '자주 묻는 질문',
    description: 'TeamMeet 서비스 이용에 대한 FAQ. 매칭, 결제, 계정 등 궁금한 점을 확인하세요.',
    type: 'website',
  },
};

export default function FaqLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
