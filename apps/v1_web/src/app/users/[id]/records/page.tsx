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
  const metadata = buildPublicMetadata({
    title: `${nickname} 님의 활동 기록`,
    description: `${nickname} 님의 공개 동의된 경기 활동 기록을 확인하세요.`,
    path: `/users/${id}/records`,
  });
  // /users/ 는 robots.txt 와 X-Robots-Tag 로 막혀 있다 — 메타도 같은 값으로 맞추고 공유 미리보기 값은 유지한다.
  return { ...metadata, robots: { index: false, follow: false } };
}

export default async function UserRecordsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await fetchPublicV1<PublicUserRecordsResponse>(`/users/${encodeURIComponent(id)}/records`))) notFound();
  return <UserRecordsPageClient userId={id} />;
}
