import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { NoticeDetailPageClient } from '@/components/notices/notices-client';
import { buildNoIndexMetadata, buildPublicMetadata, fetchPublicV1, metadataDescription } from '@/lib/seo';
import type { V1NoticeResponse } from '@/types/api';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const result = await fetchPublicV1<V1NoticeResponse>(`/notices/${encodeURIComponent(id)}`);
  if (!result) return buildNoIndexMetadata('공지사항을 찾을 수 없어요');

  return buildPublicMetadata({
    title: result.notice.title,
    description: metadataDescription(result.notice.body, 'Teameet 공지사항을 확인하세요.'),
    path: `/notices/${id}`,
    type: 'article',
  });
}

export default async function NoticeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!await fetchPublicV1<V1NoticeResponse>(`/notices/${encodeURIComponent(id)}`)) notFound();
  return <NoticeDetailPageClient noticeId={id} />;
}
