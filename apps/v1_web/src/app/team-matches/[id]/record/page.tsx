import { TeamMatchSharedRecord } from '@/components/team-matches/team-match-shared-record';

// 조회는 공개다 — GET .../record 는 OptionalV1AuthGuard 로 비로그인도 user=null 로 허용하고
// (team-match-record.controller.ts), 형제 라우트 /team-matches/:id 도 RequireAuth가 없다.
// 활동기록·팀 전적(둘 다 비로그인도 보는 공개 목록)이 친선 매치 행을 이 화면으로 바로 보내므로
// RequireAuth로 감싸면 비로그인 방문자가 보던 걸 못 보고 로그인 화면으로 튕긴다(2026-09-29
// PR #1346 리뷰 지적). 참가자 전용 편집 컨트롤은 서버가 내려주는 data.canEdit/participant로
// TeamMatchSharedRecord가 이미 가리므로, 쓰기 권한은 POST 쪽 V1AuthGuard가 그대로 막는다.
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TeamMatchSharedRecord teamMatchId={id} />;
}
