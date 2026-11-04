import type { Metadata } from 'next';
import { TournamentOpsDemo } from '@/components/tournament-ops-demo/tournament-ops-demo';

export const metadata: Metadata = {
  title: '대회 운영 콘솔 체험 | Teameet',
  description: '샘플 대회에서 참가팀 관리, 대진 편성, 경기 기록과 결과 검토를 체험해 보세요.',
  robots: { index: false, follow: false },
};

export default function TournamentOpsDemoPage() {
  return <TournamentOpsDemo />;
}
