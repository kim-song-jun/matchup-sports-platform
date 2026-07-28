'use client';

import { useEffect, useState } from 'react';
import { HomePopupDialog } from '@/components/home/home-notice-popup';
import { NoticeDetailPageView } from '@/components/notices/notices-page';
import { useV1AdminMe } from '@/hooks/use-v1-api';
import { richContentPlainText } from '@/lib/rich-content';
import type { AdminContentPreviewPayload } from '@/components/admin/admin-content-preview';

export default function AdminContentPreviewPage() {
  const admin = useV1AdminMe();
  const [payload, setPayload] = useState<AdminContentPreviewPayload | null>(null);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== window.parent) return;
      if (event.data?.type !== 'teameet:admin-content-preview') return;
      setPayload(event.data.payload as AdminContentPreviewPayload);
      setRevision((value) => value + 1);
    };
    window.addEventListener('message', receive);
    window.parent.postMessage({ type: 'teameet:admin-content-preview-ready' }, window.location.origin);
    return () => window.removeEventListener('message', receive);
  }, []);

  if (admin.isPending) return <PreviewStatus label="관리자 권한을 확인하고 있어요." />;
  if (admin.isError || !admin.data) return <PreviewStatus label="관리자만 미리보기를 볼 수 있어요." />;
  if (!payload) return <PreviewStatus label="미리보기 내용을 기다리고 있어요." />;

  if (payload.kind === 'popup') {
    return (
      <main className="min-h-screen bg-gray-50">
        <HomePopupDialog
          popup={{
            id: `admin-preview-${revision}`,
            title: payload.title || '팝업 제목',
            body: payload.body,
            content: payload.content,
            trailing: '미리보기',
            linkUrl: payload.linkUrl,
            linkLabel: payload.linkLabel,
          }}
        />
      </main>
    );
  }

  const plainText = richContentPlainText(payload.content);
  return (
    <NoticeDetailPageView
      model={{
        status: 'ready',
        notice: {
          id: 'admin-preview',
          tag: payload.category || '안내',
          title: payload.title || '공지사항 제목',
          summary: plainText,
          date: '미리보기',
          body: plainText ? plainText.split(/\n{2,}/) : ['본문을 입력해 주세요.'],
          content: payload.content,
        },
      }}
    />
  );
}

function PreviewStatus({ label }: { label: string }) {
  return <main className="grid min-h-screen place-items-center bg-gray-50 p-6 text-sm text-gray-500">{label}</main>;
}
