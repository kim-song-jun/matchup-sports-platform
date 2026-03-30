import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '강좌',
  description: '스포츠 강좌를 둘러보고 수강권을 구매하세요. 일일 체험부터 무제한 수강까지.',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
