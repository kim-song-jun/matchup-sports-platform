'use client';

import { useMemo, useState } from 'react';
import { useV1Notice, useV1Notices } from '@/hooks/use-v1-api';
import type { V1Notice } from '@/types/api';
import { NoticeDetailPageView, NoticeListPageView } from './notices-page';
import type { NoticeDetailViewModel, NoticeListViewModel, NoticeModel } from './notices.types';
import { getNoticeDetailViewModel, getNoticeListViewModel } from './notices.view-model';

export function NoticeListPageClient() {
  const [selectedCategory, setSelectedCategory] = useState('전체');
  const query = useV1Notices(selectedCategory === '전체' ? undefined : { category: selectedCategory });
  const fallback = getNoticeListViewModel();
  const categories = useMemo(() => {
    const labels = ['전체', '고정', '업데이트', '안내'];
    return labels.map((label) => ({
      label,
      active: selectedCategory === label,
      onSelect: () => setSelectedCategory(label),
    }));
  }, [selectedCategory]);

  const status: NoticeListViewModel['status'] = query.isPending
    ? 'loading'
    : query.isError
      ? 'error'
      : 'ready';

  // fallback 정적 목업은 ready 상태에서 실제 데이터가 없을 때만 사용한다.
  // 로딩·에러 중에는 목업을 실데이터처럼 노출하지 않는다.
  const noticesFromApi = query.data ? sortPinnedFirst(getNoticeItems(query.data).map(toNotice)) : [];
  // Copilot: ready 상태에선 API 결과(빈 배열 포함)를 그대로 사용 — 실제 공지가 0건일 때
  // 목업을 실데이터처럼 노출하지 않는다. fallback 은 응답 자체가 없는 예외(query.data 부재)에만.
  const noticesReady = status === 'ready'
    ? (query.data ? noticesFromApi : fallback.notices)
    : [];
  const visibleNotices = selectedCategory === '전체'
    ? noticesReady
    : noticesReady.filter((notice) => notice.tag === selectedCategory);

  const model: NoticeListViewModel = {
    ...fallback,
    filters: categories,
    notices: visibleNotices,
    status,
    onRetry: query.isError ? () => query.refetch() : undefined,
  };

  return <NoticeListPageView model={model} />;
}

export function NoticeDetailPageClient({ noticeId }: { noticeId: string }) {
  const query = useV1Notice(noticeId);
  const fallback = getNoticeDetailViewModel(noticeId);

  const status: NoticeDetailViewModel['status'] = query.isPending
    ? 'loading'
    : query.isError
      ? 'error'
      : 'ready';

  // fallback 정적 목업은 ready 상태에서 실제 데이터가 없을 때만 사용한다.
  // 로딩·에러 중에는 목업을 실데이터처럼 노출하지 않는다.
  const model: NoticeDetailViewModel = {
    ...fallback,
    notice:
      status === 'ready' && query.data
        ? toNotice(query.data.notice ?? fallbackNotice(noticeId))
        : fallback.notice,
    status,
    onRetry: query.isError ? () => query.refetch() : undefined,
  };

  return <NoticeDetailPageView model={model} />;
}

// API 시드 데이터 body에 포함된 " seed data" 접미어를 제거한다.
// 배포 전 DB 시드값이 그대로 노출되는 것을 막는 최소 sanitize 처리.
// 실제 공지 내용으로 교체되면 이 함수는 no-op이 된다.
function sanitizeBody(raw: string): string {
  return raw.replace(/\s+seed data\s*$/i, '').trim();
}

function toNotice(notice: V1Notice): NoticeModel {
  const rawBody = notice.body ?? '공지 내용이 아직 등록되지 않았어요.';
  const body = sanitizeBody(rawBody);
  const displayBody = body || '공지 내용을 불러오는 중이에요.';

  return {
    id: notice.noticeId ?? notice.id ?? 'notice',
    tag: notice.category ?? notice.audience ?? '공지',
    title: notice.title,
    summary: displayBody,
    date: formatDate(notice.publishedAt),
    pinned: notice.category === '고정',
    body: displayBody.split('\n').filter(Boolean),
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

function sortPinnedFirst(notices: NoticeModel[]) {
  return [...notices].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return 0;
  });
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });
}
