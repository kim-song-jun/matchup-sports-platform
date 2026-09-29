import { TeamMatchSharedRecord } from '@/components/team-matches/team-match-shared-record';

// 조회는 공개다. GET .../record 는 OptionalV1AuthGuard 라 비로그인도 허용하고, 공개 활동기록·
// 팀 전적이 이 화면으로 바로 링크한다. 쓰기 권한은 POST 의 V1AuthGuard 가 별도로 막는다.
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TeamMatchSharedRecord teamMatchId={id} />;
}
