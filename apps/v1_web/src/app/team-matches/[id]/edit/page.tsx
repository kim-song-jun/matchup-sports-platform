import { TeamMatchEditPageClient } from '@/components/team-matches/team-matches-create-client';

// Next 16: params는 async — 같은 폴더 detail page.tsx와 동일하게 await 해야 id가 채워진다
// (동기 접근 시 params.id=undefined → teamMatchId='' → 수정 폼 영구 로딩).
export default async function TeamMatchEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TeamMatchEditPageClient teamMatchId={id} />;
}
