import type { ReactNode } from 'react';
import { buildPublicMetadata } from '@/lib/seo';

export const metadata = buildPublicMetadata({
  title: '스포츠 이벤트',
  description: '팀밋이 준비한 스포츠 대회와 공개 이벤트를 종목별로 확인하고 바로 참가해 보세요. 일정, 장소, 참가 조건과 모집 현황을 한곳에서 볼 수 있어요.',
  path: '/events',
});

export default function EventsLayout({ children }: { children: ReactNode }) {
  return children;
}
