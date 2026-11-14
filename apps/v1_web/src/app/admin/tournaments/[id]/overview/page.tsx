import { TournamentOverviewSection } from '../overview-section';

/**
 * 대회 상세 기본 진입 섹션. 이 파일은 client 컴포넌트를 렌더하기만 하므로 서버 컴포넌트로
 * 둔다 — client 경계는 overview-section.tsx 가 갖는다.
 */
export default function AdminTournamentOverviewPage() {
  return <TournamentOverviewSection />;
}
