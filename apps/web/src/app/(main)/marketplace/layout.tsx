import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '장터',
  description: '스포츠 용품을 사고팔 수 있는 장터입니다.',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
