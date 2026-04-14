import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Teameet 요금 안내 - 합리적인 스포츠 매칭',
  description:
    '무료부터 프로, 팀 요금제까지. Teameet의 투명한 요금 구조를 확인하세요.',
  openGraph: {
    title: 'Teameet 요금 안내 - 합리적인 스포츠 매칭',
    description:
      '무료부터 프로, 팀 요금제까지. Teameet의 투명한 요금 구조를 확인하세요.',
    type: 'website',
  },
};

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
