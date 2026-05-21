'use client';

import { useV1Notice, useV1Notices } from '@/hooks/use-v1-api';
import type { V1Notice } from '@/types/api';
import { NoticeDetailPageView, NoticeListPageView } from './notices-page';
import type { NoticeDetailViewModel, NoticeListViewModel, NoticeModel } from './notices.types';
import { getNoticeDetailViewModel, getNoticeListViewModel } from './notices.view-model';

export function NoticeListPageClient() {
  const query = useV1Notices();
  const fallback = getNoticeListViewModel();
  const model: NoticeListViewModel = query.data
    ? {
        ...fallback,
        notices: getNoticeItems(query.data).map(toNotice),
      }
    : fallback;

  return <NoticeListPageView model={model} />;
}

export function NoticeDetailPageClient({ noticeId }: { noticeId: string }) {
  const query = useV1Notice(noticeId);
  const fallback = getNoticeDetailViewModel(noticeId);
  const model: NoticeDetailViewModel = query.data
    ? {
        ...fallback,
        notice: toNotice(query.data.notice ?? fallbackNotice(noticeId)),
      }
    : fallback;

  return <NoticeDetailPageView model={model} />;
}

function toNotice(notice: V1Notice): NoticeModel {
  const body = notice.body ?? '공지 본문을 불러왔지만 상세 내용은 아직 등록되지 않았습니다.';

  return {
    id: notice.noticeId ?? notice.id ?? 'notice',
    tag: notice.category ?? notice.audience ?? '공지',
    title: notice.title,
    summary: body,
    date: formatDate(notice.publishedAt),
    pinned: notice.category === '운영' || notice.audience === 'public',
    body: body.split('\n').filter(Boolean),
  };
}

function getNoticeItems(data: unknown): V1Notice[] {
  if (Array.isArray(data)) return data as V1Notice[];
  if (typeof data === 'object' && data && 'notices' in data && Array.isArray((data as { notices?: unknown }).notices)) {
    return (data as { notices: V1Notice[] }).notices;
  }
  return [];
}

function fallbackNotice(noticeId: string): V1Notice {
  const fallback = getNoticeDetailViewModel(noticeId).notice;
  return {
    id: fallback.id,
    title: fallback.title,
    category: fallback.tag,
    body: fallback.body.join('\n'),
    publishedAt: new Date().toISOString(),
  };
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });
}
