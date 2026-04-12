import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '로그인',
  description: 'TeamMeet에 로그인하세요.',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
