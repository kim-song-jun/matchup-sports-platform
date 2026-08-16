import { redirect } from 'next/navigation';

interface Props {
  params: Promise<{ id: string }>;
}

/** 대회 상세의 기본 진입 섹션. 섹션 분리 이전 기본 탭과 같은 "신청 관리"로 보낸다. */
export default async function AdminTournamentDetailPage({ params }: Props) {
  const { id } = await params;
  redirect(`/admin/tournaments/${id}/registrations`);
}
