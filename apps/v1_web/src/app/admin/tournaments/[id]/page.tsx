import { redirect } from 'next/navigation';

interface Props {
  params: Promise<{ id: string }>;
}

/**
 * 대회 상세의 기본 진입 섹션. 예전에는 '신청 관리'로 바로 보냈는데, 대회를 열자마자
 * 신청 목록만 보여서 "이 대회가 지금 어떤 상태이고 뭐가 비어 있는지"를 알려면 탭을
 * 하나씩 눌러 봐야 했다. 이제는 그걸 한 화면에 모은 '개요'로 보낸다.
 */
export default async function AdminTournamentDetailPage({ params }: Props) {
  const { id } = await params;
  redirect(`/admin/tournaments/${id}/overview`);
}
