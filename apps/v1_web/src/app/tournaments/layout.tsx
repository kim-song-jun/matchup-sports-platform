import type { ReactNode } from 'react';
import { buildPublicMetadata } from '@/lib/seo';

const tournamentMetadata = buildPublicMetadata({
  title: '스포츠 대회',
  description: '모집 중인 스포츠 대회를 찾고 일정, 참가 조건, 경기 결과를 한곳에서 확인하세요.',
  path: '/tournaments',
});

export const metadata = {
  ...tournamentMetadata,
  title: {
    default: '스포츠 대회',
    template: '%s | Teameet',
  },
};

export default function TournamentsLayout({ children }: { children: ReactNode }) {
  return children;
}
