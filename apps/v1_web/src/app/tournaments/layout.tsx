import type { ReactNode } from 'react';
import { buildTournamentListMetadata } from './tournament-list-metadata';

// 하위 라우트(상세·캠페인)의 기본값과 제목 템플릿. 목록 자체의 메타는 page.tsx 가 유형별로 정한다.
export const metadata = {
  ...buildTournamentListMetadata('all'),
  title: {
    default: '스포츠 대회',
    template: '%s | Teameet',
  },
};

export default function TournamentsLayout({ children }: { children: ReactNode }) {
  return children;
}
