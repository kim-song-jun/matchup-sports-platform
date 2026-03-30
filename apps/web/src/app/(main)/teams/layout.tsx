import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '팀',
  description: '스포츠 팀을 만들거나 가입하세요.',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
