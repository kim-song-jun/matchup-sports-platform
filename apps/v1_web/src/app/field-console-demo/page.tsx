import type { Metadata } from 'next';
import { FieldConsoleDemo } from '@/components/tournament-ops-demo/field-console-demo';

export const metadata: Metadata = {
  title: '필드 담당자 운영콘솔 체험 | Teameet',
  description: '실제 경기 운영콘솔 화면의 안내를 보고 경기 시작, 득점, 카드, 교체와 경기 종료를 샘플로 체험하세요.',
  robots: { index: false, follow: false },
};

export default function FieldConsoleDemoPage() {
  return <FieldConsoleDemo />;
}
