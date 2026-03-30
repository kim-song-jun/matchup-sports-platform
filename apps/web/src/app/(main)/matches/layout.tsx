import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '매치 찾기',
  description: '내 실력에 맞는 스포츠 매치를 찾아보세요. 풋살, 농구, 배드민턴, 테니스 등.',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
