'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { AdminPageHeader } from '@/components/admin';
import { ReviewSourcePageClient } from '@/components/reviews/reviews-api-clients';

export default function AdminTeamMatchReviewsPage() {
  const { id } = useParams<{ id: string }>();
  return <>
    <AdminPageHeader title="운영 리뷰" description="양 팀과 실제 출전 선수에게 Teameet 운영 이름으로 남겨요. 답변 평가 없이 바로 공개되며 기존 참가자 평점과 별도로 표시돼요." action={<Link className="tm-btn tm-btn-outline" href={`/admin/team-matches/${id}`}>팀매치 상세</Link>} />
    <ReviewSourcePageClient sourceType="platform_team_match" sourceId={id} complete={false} admin />
  </>;
}
