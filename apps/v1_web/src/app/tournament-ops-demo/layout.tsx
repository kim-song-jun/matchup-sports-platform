import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { TournamentOpsDemo } from '@/components/tournament-ops-demo/tournament-ops-demo';

export const metadata: Metadata = {
  title: '대회 관리 체험 | Teameet',
  description: '실제 어드민 화면에서 샘플 대회의 참가팀 관리, 대진 편성, 점수 입력과 결과 확정을 체험해 보세요.',
  robots: { index: false, follow: false },
};

export default function TournamentDemoLayout({ children }: { children: ReactNode }) {
  return <TournamentOpsDemo>{children}</TournamentOpsDemo>;
}
