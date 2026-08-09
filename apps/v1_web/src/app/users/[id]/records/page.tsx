import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { UserRecordsPageClient } from './user-records-page-client';
import { buildNoIndexMetadata, buildPublicMetadata, fetchPublicV1 } from '@/lib/seo';
import type { PublicUserRecordsResponse } from '@/components/public-game-records/types';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const records = await fetchPublicV1<PublicUserRecordsResponse>(`/users/${encodeURIComponent(id)}/records`);
  if (!records) return buildNoIndexMetadata('활동 기록을 찾을 수 없어요');
  // 닉네임만 공개 신원으로 사용한다(D-03/D-11) -- 실명·이메일 등은 절대 노출하지 않는다.
  const nickname = records.nickname ?? '회원';
  return buildPublicMetadata({
    title: `${nickname} 님의 활동 기록`,
    description: `${nickname} 님의 공개 동의된 경기 활동 기록을 확인하세요.`,
    path: `/users/${id}/records`,
  });
}

export default async function UserRecordsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await fetchPublicV1<PublicUserRecordsResponse>(`/users/${encodeURIComponent(id)}/records`))) notFound();
  return <UserRecordsPageClient userId={id} />;
}
