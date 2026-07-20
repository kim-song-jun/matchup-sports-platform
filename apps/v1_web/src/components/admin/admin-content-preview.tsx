'use client';

import { Monitor, Smartphone } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { browserAppRoute } from '@/lib/app-route';
import type { V1RichContentDocument } from '@/types/api';

export type AdminContentPreviewPayload =
  | {
      kind: 'notice';
      title: string;
      category: string;
      content: V1RichContentDocument;
      body: string;
    }
  | {
      kind: 'popup';
      title: string;
      content: V1RichContentDocument;
      body: string;
      linkUrl?: string | null;
      linkLabel?: string | null;
    };

export function AdminContentPreview({ payload }: { payload: AdminContentPreviewPayload }) {
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const previewSrc = browserAppRoute('/admin-content-preview');

  const sendPreview = () => {
    iframeRef.current?.contentWindow?.postMessage(
      { type: 'teameet:admin-content-preview', payload },
      window.location.origin,
    );
  };

  useEffect(() => {
    sendPreview();
  }, [payload]);

  useEffect(() => {
    const receiveReady = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== iframeRef.current?.contentWindow) return;
      if (event.data?.type === 'teameet:admin-content-preview-ready') sendPreview();
    };
    window.addEventListener('message', receiveReady);
    return () => window.removeEventListener('message', receiveReady);
  }, [payload]);

  return (
    <section className="mt-5 rounded-2xl border border-gray-100 bg-white p-4" aria-labelledby="content-preview-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="content-preview-title" className="text-base font-bold text-gray-900">실제 화면 미리보기</h2>
          <p className="mt-1 text-xs text-gray-500">저장 전 내용을 실제 사용자 컴포넌트와 viewport로 확인합니다.</p>
        </div>
        <div className="inline-flex rounded-xl bg-gray-100 p-1" aria-label="미리보기 화면 크기">
          <DeviceButton active={device === 'desktop'} onClick={() => setDevice('desktop')} label="웹"><Monitor /></DeviceButton>
          <DeviceButton active={device === 'mobile'} onClick={() => setDevice('mobile')} label="모바일"><Smartphone /></DeviceButton>
        </div>
      </div>
      <div className="mt-4 overflow-auto rounded-xl bg-gray-100 p-3">
        <iframe
          ref={iframeRef}
          title={`${payload.kind === 'notice' ? '공지사항' : '팝업'} ${device === 'desktop' ? '웹' : '모바일'} 미리보기`}
          src={previewSrc}
          onLoad={sendPreview}
          className="mx-auto block rounded-xl border border-gray-200 bg-white shadow-sm"
          style={{
            width: device === 'desktop' ? 1180 : 390,
            height: device === 'desktop' ? 760 : 720,
            maxWidth: '100%',
          }}
        />
      </div>
    </section>
  );
}

function DeviceButton({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition-colors [&_svg]:h-4 [&_svg]:w-4 ${active ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}
    >
      {children}{label}
    </button>
  );
}
